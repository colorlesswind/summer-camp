# 管理端（Admin）申请列表与详情 · 方案（待评审）

> 对应需求：`笔试题-全栈.md` §2.2 管理端（Admin）
> 状态：**已按本方案实现**（§2.3 方案 A；列表行内动作、只读文本、无状态计数均按默认项）。代码在 `ui/src/features/admin/`
> 日期：2026-11-09

---

## 0. 结论摘要

| 项 | 结论 |
| --- | --- |
| status 筛选布局 | **放在表格容器的顶栏**：`Status 下拉 + 关键词搜索 + 批量 Send Offer`，与表格、分页共用同一个 1px 边框容器 |
| 页面结构 | 列表页 `AdminApplicationsView` + 详情页 `AdminApplicationDetailView`，沿用 `MainLayout`，**不加左侧栏** |
| 表格实现 | 沿用学生端的手写 table 样式（细线、13px、`#fafafa` 表头），不引入 `a-table` |
| 按钮规则 | 列表行内 + 详情页都提供 Approve / Return / Send Offer；批量仅 Send Offer |
| 后端 | **无需改动**：现有 `GET /form/applications`、`GET /form/applications/:id`、`approve`、`return`、`send-offer`、`offers/batch` 已覆盖全部功能 |
| 待拍板 | ①筛选控件形态 ②列表是否放行内动作 ③详情只读用「文本」还是「disabled 控件」 ④是否加状态计数 / Submitted 列（需后端小改） |

---

## 1. 现状盘点

### 1.1 已经具备

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 管理员密码登录 | `features/auth/views/LoginView.vue` + `StaffLoginForm.vue` | §2.2.1 已完成 |
| 角色鉴权与落地页 | `router/guards.ts`、`constants/roles.ts` | `admin → /admin/applications`，越权跳 `/403` |
| 列表接口 | `GET /form/applications` | 管理员天然拿到全部数据；支持 `status`（可重复/逗号分隔）、`keyword`、`page`、`pageSize`（≤100） |
| 详情接口 | `GET /form/applications/:id` | 返回 `values` + 服务端算好的 `actions` + `timeline` |
| 审核接口 | `approve` / `return` / `send-offer` / `offers/batch` | 状态与角色双重校验，非法流转 409 |
| 管理端状态文案 | 服务端 `form.display.ts` 的 `STAFF_DISPLAY` | `displayStatus` 已按角色返回 |
| 表单渲染组件 | `FormFieldGroup`、`RepeatableSection`、`StatementSection`、`SectionNav` | 可配置驱动、可设为 disabled |
| 状态颜色 | `constants/application.ts` | 已有 9 个状态的 Tag 颜色 |

### 1.2 缺口

1. `/admin/applications`、`/admin/applications/:id` 仍是 `PlaceholderView`。
2. 前端没有管理端状态文案 / 颜色的常量（只有学生端 `STUDENT_STATUS_META`）。
3. 没有管理员视角的申请列表（筛选、分页、批量选择、行内动作）。
4. 没有「字段只读 + 审核操作」的详情页；学生表单页绑定了 `useApplicationForm`、学生侧边栏与 Save/Submit 按钮，不能直接复用。
5. `main.ts` 按需注册，缺 `Pagination`（分页）等组件。
6. `ui/src/api/application.ts` 缺 approve / return / send-offer / batch 四个写接口的封装。

---

## 2. UI 布局选型：status filter 放哪里

### 2.1 输入约束

1. **状态多且文案长**：9 个状态，管理端最长 `Pending For Preliminary Screening`（33 字符）、`Supervisor Recommended`（22 字符）；学生端文案更短（Under Review / Draft / Rejected 等），两者不是一个量级。
2. **筛选不是孤立控件**：同一行还要放关键词搜索、批量 Send Offer、结果总数；筛选结果要能回到详情再回来。
3. **管理员是队列式工作流**：先清「待初筛」队列，再清「待发 Offer」队列，需要「一眼看到当前筛选的是什么」。
4. **系统视觉**：细线（1px `#e8e8e8`）、2px 圆角、无阴影、13px 表格字号、`#fafafa` 表头、小尺寸按钮；没有卡片式阴影和浮动面板。

### 2.2 四个候选

| 方案 | 形态 | 9 个长文案可读性 | 可发现性 | 与系统一致性 | 窄屏 | 成本 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A. 表格容器顶栏**（推荐） | 表格上方一行：`Status ▾` + 搜索 + 批量按钮 | 高（下拉内全称） | 高（常驻带 label） | 高（与表格同一边框） | 好（自动换行） | 低 | **采用** |
| B. 状态 Tabs / chips | 横向标签行，如 `All ｜ Pending For Preliminary Screening ｜ …` | 中（9 个长标签必须横向滚动或换行） | 高 | 中（和分节导航同语言，但分节导航是「页内跳转」不是筛选） | 差（滚动后隐藏项） | 中 | 不采用 |
| C. 左侧状态栏 | 复用学生端 220px 左栏，竖排 9 个状态 | 高 | 高 | 高（直接复用 `application-shell.css`） | 中（塌陷成横条） | 中高 | 备选 |
| D. 表格列头筛选 | Status 列头放漏斗图标 | 低（面板遮挡、不知道有几个状态） | 低 | 低（需要引入 `a-table`） | 差 | 中 | 不采用 |

**为什么 B 不行**：把 9 个全称标签平铺，1440px 宽也要 1600px+，只能横向滚动；而筛选器一旦需要滚动，就有一半状态「看不见」，违背「按 status 筛选」的初衷。若缩写成 `Screening / Review / Offer`，又和需求要求的管理端展示文案不一致。

**为什么 D 不行**：列头筛选把「有哪些状态可选」藏进二级面板，管理员无法建立状态全集的心智模型；且当前表格是手写的，引入 `a-table` 会带来另一套边框/内边距。

**为什么 C 只是备选**：它确实能竖排显示 9 个全称并顺带做「状态计数」，但管理端只有一个功能模块，左侧栏里只有一个 `Applications` 菜单项会显得空；而且详情页要么也带一条只有一个菜单的侧栏，要么两边布局不一致。

### 2.3 推荐：A（表格容器顶栏）

把筛选器做成**表格自己的表头栏**，与表格、分页在同一个 1px 边框容器内：

```text
Applications
Review submitted applications and send offers to recommended candidates.

① 筛选顶栏（表格容器顶部）
┌──────────────────────────────────────────────────────────────────────────────┐
│ Status [All ▾]   [🔍 Application No. / name / email        ]  [Reset]        │
│                                                     [ Send Offer (0) ]       │
└──────────────────────────────────────────────────────────────────────────────┘
② 表格（与筛选栏同一边框容器）
┌────┬─────────────┬──────────────────┬──────────────┬──────────────┬─────────────────────────┬──────────────┬─────────────┐
│ ☐  │ Application │ Applicant        │ First Choice │ Second Choice│ Status                  │ Last Updated │ Action      │
├────┼─────────────┼──────────────────┼──────────────┼──────────────┼─────────────────────────┼──────────────┼─────────────┤
│ ☑  │ 26000000004 │ ZHANG, San       │ AMAT ·       │ —            │ Supervisor Recommended  │ 2026-11-09   │ [Send Offer]│
│    │             │ san@example.com  │ Blake WANG   │              │                         │ 15:14        │             │
├────┼─────────────┼──────────────────┼──────────────┼──────────────┼─────────────────────────┼──────────────┼─────────────┤
│ ☐  │ 26000000003 │ LI, Si           │ MICS ·       │ AMAT ·       │ Pending For Preliminary │ 2026-11-09   │ [Approve]   │
│    │             │ si@example.com   │ Adrian TAN   │ Blake WANG   │ Screening               │ 14:02        │ [Return]    │
└────┴─────────────┴──────────────────┴──────────────┴──────────────┴─────────────────────────┴──────────────┴─────────────┘
③ 分页（同一边框容器底部）
Total 42                                              < 1 2 3 >     20 / page ▾
```

> ①②③ 共用同一个 1px 外框；筛选栏在上、分页在下，表格只负责数据行。

**理由**：

1. **筛选与数据同框**：过滤条件贴着它作用的数据，符合后台列表的通用心智；也天然解决了「筛选区悬空、和表格对不齐」的观感问题。
2. **文案完整**：`Status Select` 的下拉项可以放全称（`Pending For Preliminary Screening`），与需求「管理端展示」完全一致，不用缩写。
3. **一行容纳三件事**：Status + 关键词 + 批量动作同处一行，右对齐的 `Send Offer (n)` 始终可见，批量能力不会被藏起来。
4. **视觉零新语言**：容器、表头、行分隔线、分页全部沿用学生端表格的 1px 细线与 13px 字号，只新增一个工具栏行；`Select` / `Input` / `Button` 高度 34px 与 `theme.ts` 一致。
5. **窄屏友好**：flex-wrap 自动换行（Status 一行、搜索一行、批量按钮一行），表格横向滚动；不需要新交互。

### 2.4 视觉规范（新增部分）

| 元素 | 规范 |
| --- | --- |
| 页面标题 | `Applications`，20px / 600，与 `application-form` 页头一致 |
| 说明文案 | 13px，`--color-text-secondary`，与学生端 intro 一致 |
| 筛选栏 | `padding: 12px 16px`，`background: #fff`，`border-bottom: 1px solid #e8e8e8`，控件间距 12px |
| Status 下拉 | 宽 260px（最长文案 + 箭头留白），`allow-clear`，清空 = All |
| 关键词输入 | 宽 280px，`allow-clear`，placeholder `Application No. / name / email` |
| 批量按钮 | 右对齐，`type="primary"`，无选中时 disabled，文案 `Send Offer (n)` |
| 表格 | 外框 1px `#e8e8e8`，表头 `#fafafa`，单元格 10px 12px，字号 13px，行 hover `#fafafa` |
| 状态列 | `a-tag`，颜色沿用 `constants/application.ts` 的映射；文案用服务端 `displayStatus` |
| 行内按钮 | `size="small"`，`Approve` / `Send Offer` 用 primary，`Return` 用 default |
| 分页 | `a-pagination`，`show-size-changer`，`page-size-options: ['20','50','100']`，`show-total` |

### 2.5 如果要换成 C（左侧状态栏）

只有在下面任一条件成立时才建议切换：

- 需要**每个状态的数量徽标**（工作量看板），且愿意加 `GET /form/applications/summary`；
- 后续管理端会增加多个模块（如导师管理、时间配置），左栏才有多个菜单项。

切换成本约半天：复用 `application-shell.css` 的 grid 外壳 + 新增 `AdminSidebar.vue`，表格与动作逻辑不变。

---

## 3. 功能方案

### 3.1 路由与页面

| 路径 | 组件 | 说明 |
| --- | --- | --- |
| `/admin/applications` | `features/admin/views/AdminApplicationsView.vue` | 列表：筛选 + 分页 + 批量 |
| `/admin/applications/:id` | `features/admin/views/AdminApplicationDetailView.vue` | 详情：只读表单 + 审核动作 |

- 两者都保留在 `MainLayout` 下（默认内边距 24/32），**不设 `fullBleed`**。
- `meta: { roles: ['admin'], title: 'Applications' | 'Application Detail' }` 沿用现有守卫。
- 删除列表/详情对 `PlaceholderView` 的引用；`PlaceholderView` 仍被导师端使用，保留。

### 3.2 列表页组件结构

```
AdminApplicationsView.vue
├── 页头（标题 + 说明）
├── ApplicationFilterBar.vue        # Status Select + 搜索 + Reset + 批量按钮
├── ApplicationTable.vue            # 手写 table + 选择列 + 行内动作
│   ├── ApplicationStatusTag.vue    # 或直接用 a-tag + StaffStatusMeta
│   └── RowActions（内联）          # Approve / Return / Send Offer
├── <a-pagination>
├── ReturnReasonModal.vue           # Return 原因（必填、max 1000、计数）
└── BatchOfferResultModal.vue       # 批量结果（成功/失败数 + 失败明细）
```

状态由 `composables/useAdminApplications.ts` 统一持有：`filters / items / total / page / loading / error / selection`，视图只做渲染。

### 3.3 数据流与 URL 同步

**筛选条件写入 URL**，这是本方案的关键决策：

```
/admin/applications?status=SupervisorRecommended&keyword=zhang&page=2&pageSize=20
```

- 打开详情再返回、刷新页面、分享链接，都能回到同一视图；
- 用 `router.replace`（不是 `push`）更新 query，避免每次输入都压历史栈；
- 请求由 `watch(() => route.query)` 驱动，浏览器前进/后退也能生效；
- 关键词 300ms 防抖；`status` / `page` / `pageSize` 变化立即请求；
- 非法 query 兜底：未知 status → All，`pageSize` 收敛到 20/50/100，`page < 1` → 1；
- 换筛选 / 换页时**清空选择**（批量只作用于当前页可见行，避免「跨页选了看不见的行」）。

### 3.4 表格列

| 列 | 内容 | 宽度 |
| --- | --- | --- |
| 选择 | `a-checkbox`；只有 `SupervisorRecommended` 可勾选，其余 disabled（title 提示原因） | 40px |
| Application No. | 链接到详情（保留当前 query） | 140px |
| Applicant | `nameEn`（大写）+ 第二行 email | 220px |
| First Choice | `firstProgramCode` · `firstSupervisorName` | 200px |
| Second Choice | `secondProgramCode` · `secondSupervisorName`（可空 `—`） | 200px |
| Status | `a-tag` + `displayStatus` | 200px |
| Last Updated | `updatedAt` → `YYYY-MM-DD HH:mm` | 140px |
| Action | 行内动作，见下方矩阵 | 190px |

- 列宽用 `table-layout: fixed` + `min-width: 1120px`，窄屏横向滚动；
- 排序沿用服务端默认 `status_changed_at DESC`（最新变动在前），本期不做列排序；
- 如需「Submitted」列，见 §4.2（需后端加视图字段）。

### 3.5 按钮规则矩阵

| 当前状态 | 列表行内 | 详情页 | 接口 |
| --- | --- | --- | --- |
| `PendingForPreliminaryScreening` | `Approve`（二次确认）、`Return`（原因弹窗） | 同左 | `POST /:id/approve`、`POST /:id/return { reason }` |
| `SupervisorRecommended` | `Send Offer`（二次确认）、可勾选批量 | `Send Offer` | `POST /:id/send-offer`、`POST /form/offers/batch` |
| 其他状态（含 Draft） | 只读，`—` | 只读 | — |

- 按钮显隐**以详情返回的 `actions` 为准**（详情页）；列表行没有 `actions`，按 status 推导（等价于服务端 `TRANSITIONS` 的规则），后端仍会二次校验；
- 收到 **409 `invalid_transition`** 时：toast 提示「状态已变化，已刷新」，并重新拉取列表/详情；
- 收到 **403** 时提示无权限（理论上路由守卫已挡住）。

### 3.6 详情页结构

```
AdminApplicationDetailView.vue
├── 返回链接 “← Applications”（优先 router.back，无历史则回列表）
├── 页头
│   ├── Application No. + 状态 Tag
│   └── 申请人（name / email / submittedAt）
├── 摘要区（2 列）
│   ├── First Choice：Program · Supervisor
│   ├── Second Choice：Program · Supervisor（或 —）
│   ├── Reviewer：firstSupervisorName
│   └── Last Updated
├── Return reason 提示条（仅 Returned，a-alert warning）
├── SectionNav（吸顶，复用学生端组件 + useSectionScrollSpy）
├── AdminApplicationBody.vue（只读渲染 schema 的全部小节；text 呈现见 §3.7）
│   ├── FormFieldGroup（presentation="text"）
│   ├── RepeatableSection（无 Action 列、无 Add row）
│   └── StatementSection（展示 Agreed / Not agreed + 条款原文）
├── Status History（表格：Action / From / To / Actor / Remark / Time，倒序）
└── 粘底操作条（sticky bottom）
    ├── 左：当前状态说明（如 “Awaiting preliminary screening.”）
    └── 右：Approve / Return / Send Offer
```

**为什么操作条粘底而不是只放页头**：详情是一份长表单，管理员通常读到底才决定；`position: sticky; bottom: 0` 的白色操作条能让按钮全程可达，同时页头保持干净（只有返回、编号、状态）。

**为什么加 Status History**：`timeline` 已经在详情响应里，零额外请求；管理员能确认「谁在什么时候退回/通过了什么」，对审核场景价值高。

```text
← Applications
26000000004                                        [ Pending For Preliminary Screening ]
ZHANG, San · san@example.com · Submitted 2026-11-09 15:14

First Choice   AMAT · Blake WANG        Second Choice   —
Reviewer       Blake WANG               Last Updated    2026-11-09 15:14

┌──────────────────────────────────────────────────────────────────────────────┐
│ Personal Particulars │ Program Choice │ Personal Statement │ ... │ Statement │
├──────────────────────────────────────────────────────────────────────────────┤
│ Personal Particulars                                                         │
│   Name in English        ZHANG, San                                          │
│   Gender                 Male                                                │
│   Personal Statement                                                         │
│   I am a final-year undergraduate student ... (full text, wrapped)           │
│ Publications (read-only table, no Action column)                             │
│ Work Experience ...                                                          │
│ Status History                                                               │
│   Action │ From │ To │ Actor │ Remark │ Time                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Awaiting preliminary screening.                       [Approve]  [Return]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

> 上方分节导航吸顶，下方操作条粘底；两者之间的表单内容只读、长文本完整换行。

### 3.7 只读渲染策略（待拍板）

当前 `FormField` 的 disabled 模式会显示灰色输入框：对文本尚可，但 8000 字的 Personal Statement 会被压进 4 行 textarea，评审体验差；下拉/日期框在只读态也显得像「还能改」。

**推荐：新增 `presentation: 'control' | 'text'`（默认 `control`，学生端行为不变）**

| 字段类型 | text 模式渲染 |
| --- | --- |
| `free_text` / `long_text` | 纯文本，`white-space: pre-wrap`，保留换行，自动换行 |
| `url` | 可点击链接（`target=_blank rel=noopener`） |
| `number` / `date` | 纯文本 / `YYYY-MM-DD` |
| `single_choice` | 选项 label；`optionsSource=programs` 查 `schema.enums.programs`；`supervisors_by_thrust` 用详情里的 `firstSupervisorName` / `secondSupervisorName` 反查两个志愿字段 |
| `checkbox` | `Yes` / `No`；Statement 小节用 `Agreed` / `Not agreed` |
| `readonly`（email） | 纯文本 |
| 空值 | `—` |

实现上：`FormField.vue` 增加分支 → `FormFieldGroup` / `RepeatableSection` / `StatementSection` 透传 prop → 新增 `.form-field__text` 样式。约 1 个组件 + 1 段 CSS + 1 个 `resolveDisplayValue()` 工具函数（~60 行）。

**备选（更快）**：详情页直接复用 disabled 控件，不新增 presentation。省半天，但长文本评审体验差；README 里也已经备注了「后续可在 FormField 增加 presentation 分支」。

### 3.8 交互细节

| 场景 | 处理 |
| --- | --- |
| Approve | `Modal.confirm`：标题 `Approve this application?`，正文含编号/姓名与「转入导师审核」说明；确认后 loading，成功 toast + 刷新当前页 |
| Return | 自定义 `a-modal`：`a-textarea`（必填、max 1000、`show-count`），空值禁用确认；成功 toast + 刷新；409 时刷新并提示 |
| Send Offer（单条） | `Modal.confirm`：说明「将发送 Offer，学生可接受或拒绝」；成功 toast + 刷新 |
| 批量 Send Offer | 选中后按钮显示 `Send Offer (n)`；确认弹窗列出数量；返回 `{total, successCount, failureCount, failures[]}`：全成功 → success toast；有失败 → `BatchOfferResultModal` 展示失败明细（Application No. + reason），并刷新列表、清空选择 |
| 批量请求中 | 按钮 loading、表格选择与行内按钮禁用，防重复提交 |
| 列表加载 | 表格区域 `a-spin`，保持布局高度，避免跳动 |
| 首次加载失败 | `a-result status="error"` + `Try again`（沿用学生端模式） |
| 筛选无结果 | 表格内空态：`No applications match these filters.` + `Clear filters` |
| 详情 404 | `a-result status="404"` + `Back to Applications` |
| 详情动作成功 | 重新拉详情（状态 Tag、粘底按钮随之更新），toast 提示 |
| 离开确认 | 无需：管理端详情没有可编辑内容 |

### 3.9 英文文案（新增 `features/admin/messages.ts`）

| key | 文案 |
| --- | --- |
| title | `Applications` |
| intro | `Review submitted applications and send offers to recommended candidates.` |
| filter.status | `Status` |
| filter.all | `All` |
| filter.searchPlaceholder | `Application No. / name / email` |
| filter.reset | `Reset` |
| filter.empty | `No applications match these filters.` |
| filter.clear | `Clear filters` |
| columns.* | `Application No.` / `Applicant` / `First Choice` / `Second Choice` / `Status` / `Last Updated` / `Action` |
| action.approve | `Approve` |
| action.return | `Return` |
| action.sendOffer | `Send Offer` |
| approve.confirmTitle / confirmContent | `Approve this application?` / `The application will be sent to the supervisor for review.` |
| return.title / label / placeholder / required | `Return application` / `Return reason` / `Explain what the applicant needs to update.` / `Return reason is required.` |
| batch.resultTitle | `Send Offer result` |
| batch.summary | `{success} succeeded, {failed} failed out of {total}.` |
| detail.back | `← Applications` |
| detail.reviewer | `Reviewer` |
| detail.history | `Status History` |
| detail.notFound | `Application not found` |

`displayStatus` 直接用服务端返回值，不在前端硬编码；筛选下拉的 9 个选项用新增的 `STAFF_STATUS_META`（label 必须与服务端 `STAFF_DISPLAY` 完全一致，含 `Pending For Preliminary Screening` 的大写 `For`）。

### 3.10 响应式与可访问性

- **≥1200px**：筛选栏一行；表格 8 列（选择 + 7 个数据列）全显示。
- **768–1200px**：筛选栏换行；表格 `min-width: 1120px` 横向滚动。
- **<640px**：Status 下拉、搜索框各占满一行；批量按钮独立一行；页头与信息区单列；粘底操作条按钮换行并保持右对齐。
- 可访问性：`Status` 用显式 `label`；搜索框 `aria-label`；行选择 checkbox 用 `aria-label="Select application {no}"`；弹窗确认按钮 focus 管理交由 AntD；状态 Tag 不能只靠颜色区分（都有文字）。

---

## 4. 接口与数据

### 4.1 复用接口（前端封装到 `api/application.ts`）

| 方法 | 用途 |
| --- | --- |
| `GET /form/schema` | 详情页渲染配置（管理员也可访问） |
| `GET /form/applications?status=&keyword=&page=&pageSize=` | 列表 |
| `GET /form/applications/:id` | 详情（含 `actions`、`timeline`） |
| `POST /form/applications/:id/approve` | Approve |
| `POST /form/applications/:id/return` `{ reason }` | Return |
| `POST /form/applications/:id/send-offer` | 单条 Offer |
| `POST /form/offers/batch` `{ ids }` | 批量 Offer（≤100 条，单条 3s 超时） |

新增前端方法：`list(params)`（管理员视角）、`approve(id)`、`returnToStudent(id, reason)`、`sendOffer(id)`、`sendOfferBatch(ids)`；`detail(id)` 与 `schema()` 直接复用。

### 4.2 可选的后端小改动（默认不做）

| 改动 | 价值 | 成本 | 建议 |
| --- | --- | --- | --- |
| `v_application_list` 增加 `submitted_at`，`ApplicationSummary` 增加 `submittedAt` | 列表可显示「Submitted」列 | 迁移 006 + 类型 + mapper（~20 行） | 若你要这一列再做 |
| `GET /form/applications/summary` 返回各状态计数 | 支持筛选下拉里的 `(12)` 徽标 / 左侧状态栏 | controller + service + repo（~60 行） | 本期可不做 |
| `sort` 参数 | 列排序 | 有 SQL 注入面，需要白名单 | 不做（默认 `status_changed_at DESC` 已够用） |

> 结论：**本方案不依赖任何后端改动**，可以先纯前端落地。

### 4.3 类型与常量

- `types/application.ts`：新增 `BatchOfferResult { total; successCount; failureCount; failures: BatchFailure[] }`、`BatchFailure { id; applicationNumber; code; message }`、`ApplicationListQuery`。
- `constants/application.ts`：新增 `STAFF_STATUS_META: Record<ApplicationStatus, { label; color }>`（label 对齐 `STAFF_DISPLAY`；color 复用现有映射）。
- `features/application/composables/useApplicationForm.ts`：把纯函数 `hydrateValue` / `makeRow` / `payloadValue` 抽到 `features/application/form-values.ts`，供学生端与管理端详情共用（避免复制后逻辑漂移）。若采用 §3.7 的 `presentation`，还会给 `FormField` 等组件加一个默认 `control` 的 prop；两者都**不改变学生端现有行为**。

---

## 5. 文件改动清单

### 新增

```text
ui/src/features/admin/
├── views/AdminApplicationsView.vue
├── views/AdminApplicationDetailView.vue
├── components/ApplicationFilterBar.vue
├── components/ApplicationTable.vue
├── components/ApplicationStatusTag.vue
├── components/ReturnReasonModal.vue
├── components/BatchOfferResultModal.vue
├── components/AdminApplicationBody.vue
├── components/StatusHistoryTable.vue
├── composables/useAdminApplications.ts
├── composables/useAdminApplicationDetail.ts
├── messages.ts
└── styles/admin.css
ui/src/features/application/form-values.ts        # 从 useApplicationForm 抽出的纯函数
ui/src/utils/application-value.ts                 # 只读展示值解析（presentation=text 时用）
```

### 修改

```text
ui/src/router/routes.ts                            # 占位页 → 真实页面
ui/src/api/application.ts                          # 新增列表/审核/批量方法
ui/src/types/application.ts                        # BatchOfferResult 等
ui/src/constants/application.ts                    # STAFF_STATUS_META
ui/src/main.ts                                     # 注册 Pagination（如用 a-pagination）
ui/src/features/application/components/FormField.vue          # presentation 分支（若采用 §3.7 推荐项）
ui/src/features/application/components/FormFieldGroup.vue     # 透传 presentation
ui/src/features/application/components/RepeatableSection.vue  # 透传 presentation / 隐藏 Action 列
ui/src/features/application/components/StatementSection.vue   # 透传 presentation
ui/src/features/application/composables/useApplicationForm.ts # 改用抽出的纯函数
ui/src/features/application/styles/application-form.css       # 只读文本样式
ui/README.md                                       # 管理端章节 + 路由表更新
```

---

## 6. 实施阶段与验证

### 6.1 阶段

| 阶段 | 内容 | 预估 |
| --- | --- | --- |
| P0 骨架 | 路由、常量、类型、API 封装、列表页壳 + 表格 + 筛选 + 分页 + URL 同步 | 0.5 天 |
| P1 列表动作 | Approve / Return（原因弹窗）/ Send Offer / 批量 + 结果弹窗 + 409 刷新 + 空态/错误态 | 0.5 天 |
| P2 详情页 | 只读表单（复用 schema 组件）+ 摘要 + 粘底操作条 + Status History | 0.5 天 |
| P3 打磨 | `presentation="text"` 只读呈现、响应式、README、截图 | 0.5 天 |

### 6.2 验证清单

**自动**

```bash
cd ui && npm run typecheck && npm run build
```

**手动（需服务端 + 数据库）**

1. 管理员登录 → 落地 `/admin/applications`；默认 All、分页总数正确。
2. 9 个状态逐个筛选；`status` 反映在 URL；刷新后筛选保留；清空 = All。
3. 关键词按编号 / 姓名 / 邮箱搜索；与 status 组合；300ms 防抖；无结果空态。
4. 分页 20/50/100；翻页清空选择；从详情返回列表仍保留筛选。
5. `PendingForPreliminaryScreening`：Approve 弹窗 → 状态变 `PendingSupervisorReview`；Return 空原因被拦截，填原因后变 `Returned`，详情显示退回原因。
6. `SupervisorRecommended`：单条 Send Offer → `OfferSent`；勾选 2 条批量 → 结果弹窗数量正确；人为把其中一条状态改掉再批量 → 部分失败并展示原因。
7. 409 处理：两个标签页同时操作同一条，后操作提示状态已变化并刷新。
8. 详情：只读、无输入框；长文本完整换行；SectionNav 吸顶可跳转；Status History 顺序正确。
9. 越权：导师账号访问 `/admin/applications` → `/403`；不存在的 id → 404 页。
10. 响应式：1440 / 1024 / 390 三档截图；无横向溢出（表格内部滚动除外）。
11. 学生端回归：`/applications`、`/applications/:id`、Save/Submit/Resubmit、Accept/Decline 行为不变（因为 `presentation` 默认 `control`）。
12. 截图归档到 `ui/.screenshots/admin-*.png`（沿用现有命名习惯）。

---

## 7. 需要你拍板的问题

### 需要明确选择

1. **筛选控件形态**：`Status 下拉`（推荐，§2.3）还是 `左侧状态栏`（§2.5）？
2. **列表行内动作**：按需求在行内直接放 `Approve / Return / Send Offer`（推荐），还是列表只放 `View`、动作全部收进详情页？
3. **详情只读呈现**：文本化（推荐，§3.7，多约 0.5 天）还是复用灰色 disabled 控件（更快）？
4. **可选增强**：是否需要「各状态计数」和「列表 Submitted 列」？两者都需要后端小改（§4.2），默认不做。

### 默认采用（如无异议按此实现）

- 状态筛选**单选**（API 支持多选，但单选更贴合队列心智；后续要改成多选只是 `mode="multiple"` + 参数序列化）；
- 批量选择**仅当前页**，换页/换筛选即清空；
- 列表包含 `Draft`（可查看、不可操作），默认 All；
- 筛选条件写 URL，`router.replace`；
- 表格手写、复用学生端视觉，不引入 `a-table`；
- 详情页操作条粘底；Status History 保留；
- 不修改后端。

---

## 附：与需求条目的对应

| 需求（§2.2） | 方案落点 |
| --- | --- |
| 1. 管理员密码登录 | 已完成（`StaffLoginForm`） |
| 2. 列表（建议按 status 筛选） | `/admin/applications`：顶栏 Status 筛选 + 关键词 + 分页 |
| 2. 详情（同 application-form.png，字段只读） | `/admin/applications/:id`：schema 驱动只读渲染 |
| 2. 列表和详情页的按钮规则 | §3.5 矩阵：列表行内 + 详情粘底条 |
| `PendingForPreliminaryScreening` → Approve / Return（可填原因） | 两个页面均提供；Return 原因必填弹窗 |
| `SupervisorRecommended` → Send Offer，支持批量 | 行内单条 + 勾选批量，结果汇总成功/失败/原因 |
| 3. Submit 时间配置 | 已由 `submission_windows` 承担，管理端不新增页面 |
| 状态流转同时校验状态与角色 | 前端按钮显隐 + 服务端 `assertCan` 双层校验，409 兜底刷新 |
| 前后端状态值一致 | 直接用 `ApplicationStatus` 9 个字符串；展示用服务端 `displayStatus` |
