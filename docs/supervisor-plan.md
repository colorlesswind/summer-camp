# 导师端（Supervisor）申请列表与详情 · 方案

> 对应需求：`笔试题-全栈.md` §2.3 导师端（Supervisor）
> 状态：**已按本方案实现**（方案 B 共享层 + §7 确认项）；代码在 `ui/src/features/staff/` 与 `ui/src/features/supervisor/`
> UI 参考：管理端 `/admin/applications`（同一套表格 / 筛选 / 粘底操作条语言）
> 日期：2026-11-10

---

## 已确认的评审结论（2026-11-10）

| 议题 | 结论 |
| --- | --- |
| 复用策略 | **B：抽 `features/staff/` 共享层**，管理端改为引用（类名 `admin-` → `staff-`，纯机械改名） |
| 列表列 | **不加 Second Choice**：导师只关心第一志愿（即自己），加了与 Program 重复 |
| 筛选默认值 | **`All`**：导师能看到的都是已进入导师审核的申请，不需要默认收窄 |
| Reject 备注 | **可选备注**（≤1000，写入 Status History 的 Remark）；Recommend 只做二次确认 |
| 「待我审 n 条」计数 | **本期不做**（需要后端 `summary` 接口，当前阶段非必要） |

---

## 0. 结论摘要

| 项 | 结论 |
| --- | --- |
| 后端 | **无需改动**。列表收窄、详情 404、Recommend / Reject、导师端文案、reviewer 分配均已实现（证据见 §4.3） |
| 路由 | `/supervisor/applications`、`/supervisor/applications/:id` 由 `PlaceholderView` 换成真实页面；`ROLE_HOME` 已指向该地址，不用改 |
| 页面结构 | 完全沿用管理端：`MainLayout` + 「表格容器顶栏筛选」+ 分页 + 详情页只读表单 + 吸顶分节导航 + 粘底操作条，**不加左侧栏** |
| 复用策略 | **B：抽 `features/staff/` 共享层**（已采用），管理端改为引用 |
| 列表能力 | 6 个「导师可见状态」筛选 + 关键词 + 分页；URL 即筛选状态；**无批量、无勾选列** |
| 动作 | `PendingSupervisorReview` → 行内/详情 **Recommend**（二次确认）、**Reject**（可选备注 ≤1000）；均为单条 |
| 评审结论 | 方案 B；不加 Second Choice；默认 `All`；Reject 可选备注；不做「待审」计数（见上一节） |

---

## 1. 现状盘点

### 1.1 已经具备（后端，本次可直接用）

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 列表按角色自动收窄 | `server/src/form/form.service.ts:376-413` | 导师：`reviewer_supervisor_id = 自己`，且 `status ∈ 6 个可见状态`；请求不可见状态 → 返回空列表，而不是悄悄忽略筛选 |
| 详情可见性 | `form.service.ts:415-430` | 未分配 / 未进入导师审核 → **404**（不泄露存在性） |
| 动作闸门 | `form.service.ts:843-866` + `application.state.ts:77-86` | 先校验归属（非本人 404），再 `assertCan`（角色 403 / 状态 409） |
| Recommend / Reject | `form.routes.ts:104-117`、`form.service.ts:589-595` | `reason` **可选**，落库到 `status_logs.remark` |
| reviewer 分配 | `form.service.ts:876-886` | Submit / Resubmit 时按**第一志愿导师**写入 `reviewer_supervisor_id`；改志愿会同步改人 |
| 导师端文案 | `form.display.ts:33-46` | `displayStatus` 与管理端一致（`Supervisor Recommended` 等）；`toDisplayStatus(status, role)` 已按角色返回 |
| 可见状态集合 | `form.display.ts:52-59` | `PendingSupervisorReview` / `SupervisorRecommended` / `SupervisorRejected` / `OfferSent` / `OfferAccepted` / `OfferDeclined` |
| 账号绑定 | `supervisor.repository.ts`、`005_seed_supervisors.sql` | `supervisors.user_id` 关联登录账号；未绑定 → 403 `supervisor_not_registered` |
| 密码登录 | `features/auth/components/StaffLoginForm.vue` | §2.3.1 已完成，导师与管理员共用 |

### 1.2 缺口（都在前端）

1. 两个导师路由仍是 `PlaceholderView`（`router/routes.ts:107-117`）——登录后只有「下一页实现」提示。
2. 没有导师端功能目录与文案：`features/supervisor/` 不存在。
3. 前端没有「导师可见状态」常量，筛选下拉会把 9 个状态全列出来，其中 3 个（Draft / PendingForPreliminaryScreening / Returned）永远查不到数据。
4. `api/application.ts` 缺 `recommend(id, reason?)` / `reject(id, reason?)`。
5. 管理端的只读表单（`AdminApplicationBody`）、Status History、表格视觉 CSS 都锁在 `features/admin/` 里，导师端要么复制、要么先抽公共层。
6. 没有「导师账号未绑定档案」的前端兜底：现在会落到通用错误页，用户不知道要找谁。
7. `ui/README.md` 的路由表与目录结构还写着「占位 / 下一阶段新增」。

---

## 2. UI 布局与复用策略

### 2.1 布局：直接对齐管理端

```text
Assigned Applications
Applications assigned to you as the first-choice supervisor. Recommend or reject
applicants who passed the preliminary screening.

① 表格容器顶栏（与表格、分页同一个 1px 边框容器）
┌──────────────────────────────────────────────────────────────────────────────┐
│ Status [All ▾]   [🔍 Application No. / name / email        ]  [Reset]        │
└──────────────────────────────────────────────────────────────────────────────┘
② 表格
┌─────────────┬──────────────────┬───────────┬──────────────────────────┬──────────────┬─────────────┐
│ Application │ Applicant        │ Program   │ Status                   │ Last Updated │ Action      │
├─────────────┼──────────────────┼───────────┼──────────────────────────┼──────────────┼─────────────┤
│ 26000000004 │ ZHANG, San       │ AMAT      │ Pending Supervisor Review│ 2026-11-09   │ [Recommend] │
│             │ san@example.com  │           │                          │ 15:14        │ [Reject]    │
├─────────────┼──────────────────┼───────────┼──────────────────────────┼──────────────┼─────────────┤
│ 26000000002 │ LI, Si           │ MICS      │ Supervisor Recommended   │ 2026-11-09   │ —           │
│             │ si@example.com   │           │                          │ 14:02        │             │
└─────────────┴──────────────────┴───────────┴──────────────────────────┴──────────────┴─────────────┘
③ 分页（同一容器底部）
Total 12                                              < 1 2 3 >     20 / page ▾
```

与管理端刻意保持一致的四点：筛选在表格容器**顶栏**、表格**手写不引 `a-table`**、详情操作条**粘底**、
状态 Tag 用服务端 `displayStatus`。差异只有「没有勾选列 / 没有批量按钮 / 动作换成 Recommend + Reject」。

### 2.2 三个复用方案

| 方案 | 做法 | 重复量 | 改动面 | 风险 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **A. 直接复制** | `features/supervisor/` 复制管理端表格、筛选栏、只读表单、CSS 后改动作 | 高（~200 行 CSS + ~90 行只读表单 + 文案） | 只新增文件 | 低 | 最快，但两份只读渲染会各自漂移 |
| **B. 抽 `features/staff/` 共享层**（推荐） | 只读表单 / Status History / 筛选栏 / 表格视觉 CSS 上移；admin 与 supervisor 各自保留 view + composable + 表格动作 | 低 | 管理端 8 个文件机械改名/改 import | 中低（管理端需回归） | **采用** |
| **C. 通用列表组件 + 角色配置** | 一个 `ApplicationListView` 接受 columns / actions / messages 配置 | 最低 | 管理端大改 | 中高（抽象过早、条件分支多） | 不做：笔试题场景下可读性反而下降 |

### 2.3 方案 B 的共享边界

**上移到 `features/staff/`（角色无关）**

```text
features/staff/
├── components/
│   ├── ApplicationReadOnlyBody.vue   # 由 AdminApplicationBody 改名，逻辑零改动
│   ├── StatusHistoryTable.vue        # 由 admin 移入，文案改用 STAFF_MESSAGES
│   └── ApplicationFilterBar.vue      # 由 admin 泛化：props 传 statusOptions + texts，#actions 插槽
├── messages.ts                       # actionLabel / formatDateTime / formatDateTimeSeconds / 通用表头文案
└── styles/staff.css                  # 由 admin.css 改名，类名前缀 admin- → staff-
```

`ApplicationFilterBar` 泛化后的接口（管理端/导师端差异全靠参数与插槽，不靠分支）：

```ts
props: {
  status: ApplicationStatus | null;
  statusOptions: { value: ApplicationStatus; label: string }[];
  keyword: string;
  texts: { statusLabel: string; all: string; searchPlaceholder: string; reset: string };
  busy?: boolean;
};
slots: { actions?: () => any };   // 管理端放批量 Send Offer，导师端不传
```

**各自保留（角色专属）**

| 模块 | admin | supervisor |
| --- | --- | --- |
| view | `AdminApplicationsView` / `AdminApplicationDetailView` | `SupervisorApplicationsView` / `SupervisorApplicationDetailView` |
| composable | `useAdminApplications`（含 selection / batch） | `useSupervisorApplications`（无 selection） |
| 表格 | `ApplicationTable`（勾选列 + 批量 + 3 种动作） | `SupervisorApplicationTable`（无勾选 + 2 种动作） |
| 弹窗 | `ReturnReasonModal`（必填）、`BatchOfferResultModal` | `ReviewRemarkModal`（可选备注） |
| 文案 | `ADMIN_MESSAGES`、`ADMIN_STATUS_HINTS` | `SUPERVISOR_MESSAGES`、`SUPERVISOR_STATUS_HINTS` |

> 表格不强行合并：列集合与动作列差异大，硬抽会变成「配置里写渲染分支」。视觉由 `staff.css` 统一。
> 如果评审倾向「少碰现有代码」，可退回方案 A：把 `staff.css` 改为复制一份 `supervisor.css`，
> 只读表单与 Status History 仍从 `features/admin/` import（留 TODO）。

### 2.4 视觉规范

完全沿用管理端（`features/staff/styles/staff.css`），不新增视觉语言：1px `#e8e8e8` 细线、2px 圆角、
13px 表格字号、`#fafafa` 表头、行 hover、无阴影、小尺寸按钮、`a-pagination` 20/50/100。

---

## 3. 功能方案

### 3.1 路由

| 路径 | 组件 | meta |
| --- | --- | --- |
| `/supervisor/applications` | `features/supervisor/views/SupervisorApplicationsView.vue` | `roles: ['supervisor']`, `title: 'Assigned Applications'` |
| `/supervisor/applications/:id` | `features/supervisor/views/SupervisorApplicationDetailView.vue` | `roles: ['supervisor']`, `title: 'Application Detail'` |

- 两者都在 `MainLayout` 下，**不设 `fullBleed`**（与管理端一致，内外边距 24/32）。
- 守卫、`ROLE_HOME.supervisor`、登录后跳转均已就绪，无需改动。
- 删除这两条路由对 `PlaceholderView` 的引用；`PlaceholderView` 若无其他引用则可删（当前只剩导师端在用）。

### 3.2 列表页组件结构

```text
SupervisorApplicationsView.vue
├── 页头（Assigned Applications + 说明）
├── ApplicationFilterBar（staff，6 个状态选项，无 #actions 插槽）
├── SupervisorApplicationTable.vue
│   ├── 6 列：Application No. / Applicant / Program / Status / Last Updated / Action
│   ├── 空态（有筛选 / 无筛选两种文案）
│   └── 动作：Recommend（primary）/ Reject（default）
├── <a-pagination>
└── ReviewRemarkModal.vue（Reject 可选备注）
```

状态统一由 `composables/useSupervisorApplications.ts` 持有：`items / total / page / pageSize /
keyword / status / loading / error / notRegistered / actionBusy / pendingAction`，视图只负责渲染。

### 3.3 筛选与 URL

与管理端同构，行为直接复用同一套约定：

```text
/supervisor/applications?status=PendingSupervisorReview&keyword=zhang&page=2&pageSize=20
```

- 筛选条件写 URL（`router.replace`），刷新 / 前进后退 / 从详情返回都能还原；
- 关键词 300ms 防抖；`status`、`page`、`pageSize` 变化立即请求；
- 非法 query 兜底：未知 status → All，`pageSize` 收敛 20/50/100，`page < 1` → 1；
- 筛选下拉**只列 6 个导师可见状态**（不提供 3 个永远为空的选项）；
- 当前页被操作空了（如同页全部 Recommend 后状态仍可见，或换筛选）→ 回退到最后一页。

### 3.4 动作矩阵

| 当前状态 | 列表行内 | 详情页 | 接口 |
| --- | --- | --- | --- |
| `PendingSupervisorReview` | `Recommend`（二次确认）、`Reject`（可选备注弹窗） | 同左（粘底条） | `POST /form/applications/:id/recommend`、`.../reject` |
| `SupervisorRecommended` | 只读 `—` | 只读，提示「等待管理员发 Offer」 | — |
| `SupervisorRejected` | 只读 `—` | 只读，提示「已拒绝」 | — |
| `OfferSent` | 只读 `—` | 只读 | — |
| `OfferAccepted` | 只读 `—` | 只读 | — |
| `OfferDeclined` | 只读 `—` | 只读 | — |

- **单条操作**，不做批量（需求明确「均为单条操作」）；
- 按钮显隐以详情返回的 `actions` 为准；列表行没有 `actions`，按 `status === 'PendingSupervisorReview'` 推导，后端仍二次校验；
- 收到 **409 `invalid_transition`**：toast「状态已变化，已刷新」并重新拉数据（列表/详情）；
- 收到 **404**：详情按「找不到」页处理（可能被管理员退回、或已改派他人）；
- 任何动作成功后**重新拉当前页/详情**，让状态 Tag、按钮、列表排序同步更新。

### 3.5 详情页结构

```text
SupervisorApplicationDetailView.vue
├── 返回链接 “← Applications”（优先 router.back，无历史则回列表）
├── 页头：Application No. + 状态 Tag；申请人 name / email / Submitted
├── 摘要区（2 列）：First Choice · Program / Second Choice · Program / Submitted / Last Updated
├── 吸顶分节导航（复用 SectionNav + useSectionScrollSpy）
├── ApplicationReadOnlyBody（presentation="text"：长文本换行、选项 label、URL 可点）
├── Status History（Action / From / To / Actor / Remark / Time，倒序；含 Reason / 备注）
└── 粘底操作条
    ├── 左：状态说明（见 §3.6）
    └── 右：Recommend / Reject（或 Read-only）
```

```text
← Applications
26000000004                                    [ Pending Supervisor Review ]
ZHANG, San · san@example.com · Submitted 2026-11-09 15:14

First Choice   AMAT          Second Choice   —
Submitted      2026-11-09 15:14    Last Updated    2026-11-09 15:14

┌──────────────────────────────────────────────────────────────────────────────┐
│ Personal Particulars │ Program Choice │ Personal Statement │ ... │ Statement │
├──────────────────────────────────────────────────────────────────────────────┤
│ Personal Particulars                                                         │
│   Name in English        ZHANG, San                                          │
│   Personal Statement     I am a final-year undergraduate student ...         │
│ Status History                                                               │
│   Action │ From │ To │ Actor │ Remark │ Time                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Awaiting your review.                                    [Recommend] [Reject]│
└──────────────────────────────────────────────────────────────────────────────┘
```

与管理端详情的差异仅三处：摘要去掉 `Reviewer`（就是自己）、无退回原因提示条（`Returned` 对导师不可见）、
操作条按钮换成 Recommend / Reject。

### 3.6 状态说明文案（粘底条左侧）

| status | 文案 |
| --- | --- |
| `PendingSupervisorReview` | `Awaiting your review.` |
| `SupervisorRecommended` | `You recommended this applicant. Waiting for the administrator to send an offer.` |
| `SupervisorRejected` | `You rejected this application.` |
| `OfferSent` | `Offer sent, waiting for the applicant to respond.` |
| `OfferAccepted` | `Offer accepted by the applicant.` |
| `OfferDeclined` | `Offer declined by the applicant.` |

（`Record<ApplicationStatus, string>` 写全 9 个，理论上不可见的 3 个给兜底「Read-only」，避免类型缺口。）

### 3.7 边界与异常

| 场景 | 处理 |
| --- | --- |
| 导师账号未绑定导师档案（403 `supervisor_not_registered`） | **专用结果页**：`Your account is not linked to a supervisor profile.` + `Please contact the administrator to link your account.`，而不是通用报错。列表与详情都要兜底 |
| 访问别人的申请 / 未进入导师审核的申请 | 后端 404；前端按「申请不存在或未分配给你」的结果页处理，不区分原因 |
| 列表无任何数据 | `No applications are assigned to you yet.` |
| 筛选无结果 | `No applications match these filters.` + `Clear filters` |
| 首次加载失败 | `a-result status="error"` + `Try again` |
| 动作进行中 | 点击行按钮 loading，其余行动作禁用，防重复提交 |
| 状态已被他人改变（409） | 提示 + 自动刷新（见 §3.4） |
| 摘要字段为空 | 显示 `—`（同管理端） |

### 3.8 英文文案（新增 `features/supervisor/messages.ts`）

| key | 文案 |
| --- | --- |
| title | `Assigned Applications` |
| intro | `Applications assigned to you as the first-choice supervisor. Recommend or reject applicants who passed the preliminary screening.` |
| filter.* | `Status` / `All` / `Application No. / name / email` / `Reset` |
| filter.empty / emptyAll / clearFilters | `No applications match these filters.` / `No applications are assigned to you yet.` / `Clear filters` |
| columns.* | `Application No.` / `Applicant` / `Program` / `Status` / `Last Updated` / `Action` |
| action.recommend / action.reject / action.cancel | `Recommend` / `Reject` / `Cancel` |
| recommend.confirmTitle / confirmContent | `Recommend this applicant?` / `Application {no} will be marked as Supervisor Recommended and forwarded to the administrator.` |
| recommend.success | `Application recommended.` |
| reject.title / remarkLabel / placeholder / confirm / success | `Reject application` / `Remark (optional)` / `Explain why this application is rejected.` / `Reject` / `Application rejected.` |
| detail.back / submitted / firstChoice / secondChoice / lastUpdated | `← Applications` / `Submitted` / `First Choice` / `Second Choice` / `Last Updated` |
| detail.notFoundTitle / notFoundHint | `Application not found` / `The application may not exist, or it is not assigned to you.` |
| detail.readOnly | `Read-only` |
| notRegistered.title / hint | `Supervisor profile not linked` / `This account is not linked to a supervisor profile. Please contact the administrator.` |
| loading / loadFailed / actionFailed / stale | `Loading applications…` / `Unable to load applications. Please try again.` / `Unable to complete this action. Please try again.` / `The status has changed. The page has been refreshed.` |

状态文案一律用服务端 `displayStatus`；筛选下拉用 `SUPERVISOR_STATUS_OPTIONS`（label 必须与
`form.display.ts` 的 `STAFF_DISPLAY` 完全一致）。

---

## 4. 接口与数据

### 4.1 复用接口

| 方法 | 用途 | 现状 |
| --- | --- | --- |
| `GET /form/schema` | 详情页渲染配置 | 已封装 `applicationApi.schema()` |
| `GET /form/applications?status=&keyword=&page=&pageSize=` | 列表（服务端按角色收窄） | 已封装 `applicationApi.list()`，**导师直接复用** |
| `GET /form/applications/:id` | 详情（含 `actions`、`timeline`） | 已封装 |
| `POST /form/applications/:id/recommend` | Recommend（`reason` 可选） | **待新增封装** |
| `POST /form/applications/:id/reject` | Reject（`reason` 可选） | **待新增封装** |

### 4.2 新增前端方法

```ts
async recommend(id: string, reason?: string): Promise<ApplicationDetail>
async reject(id: string, reason?: string): Promise<ApplicationDetail>
```

### 4.3 为什么不需要改后端（逐条对照）

| 需求 §2.3 | 现有实现 |
| --- | --- |
| 仅可查看分配给当前导师的申请 | `formRepository.list` 的 `reviewerSupervisorId` 过滤（`form.service.ts:395-405`） |
| 仅 `PendingSupervisorReview` 起可见 | `SUPERVISOR_VISIBLE_STATUSES` + list 的白名单裁剪 + detail 的 `isVisibleToSupervisor`（404） |
| 初筛前状态不可见 | 同上，且 detail 统一 404，不泄露存在性 |
| `PendingSupervisorReview` 可 Recommend / Reject | `TRANSITIONS.recommend/reject` + `POST .../recommend|reject` |
| 单条操作 | 路由只有单条端点，无批量 |
| 已处理及后续状态只读 | `computeActions` 只对 `PendingSupervisorReview` 返回 recommend/reject；其余为空数组 |
| 文案同管理端 | `toDisplayStatus(status, role)`：非 student 走 `STAFF_DISPLAY` |
| 状态流转同时校验状态与角色 | `assertCan`（403 角色 / 409 状态）+ 事务内 `lockById` |
| reviewer 由第一志愿确定 | Submit / Resubmit 写入 `reviewer_supervisor_id = 第一志愿导师` |

> 结论：**本期是纯前端任务**，可以用 mock 数据先做 UI，再连真实接口。

### 4.4 可选后端增强（默认不做）

| 改动 | 价值 | 成本 | 建议 |
| --- | --- | --- | --- |
| `GET /form/applications/summary` 返回各状态计数 | 筛选下拉显示 `(n)` / 「待我审 n 条」 | controller + service + repo（~60 行） | 本期不做 |
| 列表返回 `submittedAt` | 列表加 `Submitted` 列 | 视图字段 + 类型 + mapper（~20 行） | 本期不做（详情已有） |
| 列表默认排序按 `status` 优先级 | 「待审」置顶 | SQL 排序白名单 | 不做，保留 `status_changed_at DESC` |

---

## 5. 文件改动清单

### 新增

```text
ui/src/features/staff/
├── components/ApplicationReadOnlyBody.vue     # 由 admin 的 AdminApplicationBody 改名
├── components/StatusHistoryTable.vue          # 由 admin 移入
├── components/ApplicationFilterBar.vue        # 由 admin 泛化（statusOptions + texts + #actions）
├── messages.ts                                # actionLabel / formatDateTime / 通用文案
├── types.ts                                   # 筛选栏 props 类型
└── styles/staff.css                           # 由 admin.css 改名，类名前缀 staff-

ui/src/features/supervisor/
├── views/SupervisorApplicationsView.vue
├── views/SupervisorApplicationDetailView.vue
├── components/SupervisorApplicationTable.vue
├── components/ReviewRemarkModal.vue
├── composables/useSupervisorApplications.ts
├── composables/useSupervisorApplicationDetail.ts
└── messages.ts
```

### 修改

```text
ui/src/router/routes.ts                              # 两个占位页 → 真实页面；清理 PlaceholderView import
ui/src/api/application.ts                            # + recommend / reject
ui/src/constants/application.ts                      # + SUPERVISOR_VISIBLE_STATUSES / SUPERVISOR_STATUS_OPTIONS
ui/src/features/admin/views/AdminApplicationsView.vue        # 改用 staff 的 FilterBar / 表格文案 / CSS
ui/src/features/admin/views/AdminApplicationDetailView.vue   # 改用 staff 的 ReadOnlyBody / StatusHistory / CSS
ui/src/features/admin/components/ApplicationTable.vue        # 样式类名 admin- → staff-
ui/src/features/admin/components/ReturnReasonModal.vue       # 同上
ui/src/features/admin/components/BatchOfferResultModal.vue   # 同上
ui/src/features/admin/messages.ts                            # 抽走通用文案/日期函数，保留管理端专属
ui/src/pages/PlaceholderView.vue                             # 若无引用则删除
README.md / ui/README.md                                     # 导师端章节、路由表、目录树、截图索引
```

> 方案 B 的「修改」以**机械改名 + import 调整**为主，不改管理端任何业务逻辑；方案 A 则只需要新增 `features/supervisor/`。

---

## 6. 实施阶段与验证

### 6.1 阶段（按方案 B）

| 阶段 | 内容 | 预估 |
| --- | --- | --- |
| P0 共享层 | 抽 `features/staff/`（只读表单、History、FilterBar、CSS、文案），管理端改引用并回归 | 0.5 天 |
| P1 列表骨架 | 路由、常量（6 状态）、API 封装、表格 + 筛选 + 分页 + URL 同步 + 空态/错误态 | 0.5 天 |
| P2 列表动作 | Recommend 二次确认、Reject 备注弹窗、409 刷新、行内 loading | 0.3 天 |
| P3 详情页 | 只读表单复用、摘要、吸顶导航、Status History、粘底操作条、404 | 0.5 天 |
| P4 打磨 | 未绑定档案兜底、响应式、README、截图归档 | 0.4 天 |

合计约 **2.2 天**（若选方案 A，P0 可省，约 1.6 天）。

### 6.2 自动验证

```bash
cd ui && npm run typecheck && npm run build
```

### 6.3 手动验证清单

> 前置：`server/.env` 的 `BOOTSTRAP_SUPERVISOR_*_EMAIL` 必须存在于 `附件/supervisor.xlsx` 名单（否则
> `supervisors.user_id` 绑不上，导师端列表恒空）；或直接按 `server/README.md` §10.10 手工绑定。

1. 导师登录 → 落地 `/supervisor/applications`；只看到 `reviewer = 自己` 且状态 ≥ `PendingSupervisorReview` 的申请。
2. 状态下拉只有 6 项；选 `Pending Supervisor Review` 只剩待审；URL 反映 `status`；刷新后保留。
3. 关键词按编号 / 姓名 / 邮箱搜索；与状态组合；300ms 防抖；无结果空态 + `Clear filters`。
4. 分页 20/50/100；从详情返回列表仍保留筛选。
5. 行内 `Recommend` → 二次确认 → 状态变 `Supervisor Recommended`，按钮变 `—`；详情同步。
6. 行内 `Reject` → 备注留空可提交 → 状态变 `Supervisor Rejected`；填备注后 Status History 的 Remark 可见。
7. 详情页动作与列表一致；粘底条按钮仅 `PendingSupervisorReview` 出现，其余显示 `Read-only`。
8. 用另一位导师的账号访问该申请 id → 结果页「Application not found」；直接改 URL 试 `Draft` 申请同样 404。
9. 管理员 / 学生账号访问 `/supervisor/applications` → `/403`。
10. 未绑定档案的导师账号登录 → 专用提示页（不是白屏/通用错误）。
11. 双标签页同时 Recommend 同一条 → 后操作提示「状态已变化」并自动刷新。
12. 回归管理端：列表筛选/批量 Send Offer/详情三动作与改版前一致；学生端 `/applications`、表单 Save/Submit 行为不变。
13. 响应式 1440 / 1024 / 390 三档无横向溢出（表格内部滚动除外）。
14. 截图归档 `ui/.screenshots/supervisor-list.png`、`supervisor-list-empty.png`、`supervisor-detail.png`。

### 6.4 本轮已验证

- `cd ui && npm run typecheck && npm run build` 通过；
- 用真实后端 + 真实数据库（导师 `supervisor1@example.com` → Blake WANG）在 headless Chrome 下验证：
  - 列表只显示分配给自己的申请，6 状态筛选与 URL 生效，筛选空态正确；
  - `PendingSupervisorReview` 行内出现 Recommend / Reject，其余状态显示 `—`；
  - 详情只读表单、摘要、Status History、粘底操作条（待审时 Recommend / Reject，已录取时 Read-only）渲染正常；
  - 管理端列表 / 详情在共享层重构后视觉与行为不变（同时做了截图回归）。

---

## 7. 评审结论（已确认）

| # | 议题 | 结论 |
| --- | --- | --- |
| 1 | 复用策略 | **B**：抽 `features/staff/` 共享层（管理端改引用并回归） |
| 2 | 列表列 | **不加** `Second Choice` |
| 3 | 筛选默认值 | **`All`** |
| 4 | Reject 备注 | **可选备注**弹窗；Recommend 纯二次确认 |
| 5 | 待审计数 | **不做**（需后端 `summary`，本期非必要） |

### 实现时采用的默认项

- 路由 `/supervisor/applications`、`/supervisor/applications/:id`，标题 `Assigned Applications` / `Application Detail`；
- 完全沿用管理端视觉，筛选在表格容器顶栏，详情操作条粘底；
- 列表 6 列（无勾选、无批量），动作仅行内 Recommend / Reject，均单条；
- 详情复用 `presentation="text"` 只读渲染 + Status History；
- 筛选只有 6 个可见状态，URL 同步，关键词 300ms 防抖；
- 409 自动刷新；404 与 403 `supervisor_not_registered` 均有专用提示；
- 不改后端、不改数据库。

---

## 附：与需求条目的对应

| 需求（§2.3） | 方案落点 |
| --- | --- |
| 1. 登录页（管理员与导师共用密码登录） | 已完成（`StaffLoginForm`），本期不动 |
| 2. 列表（建议按 status 筛选） | `/supervisor/applications`：顶栏 6 状态筛选 + 关键词 + 分页，服务端按 reviewer 收窄 |
| 2. 详情（同 application-form.png，字段只读） | `/supervisor/applications/:id`：schema 驱动只读渲染 |
| 仅可查看分配给自己的、`PendingSupervisorReview` 起的申请 | 后端强制（list 过滤 + detail 404）；前端不提供越权入口 |
| `PendingSupervisorReview` 可 Recommend / Reject（列表和详情） | 行内 + 粘底条，单条；Reject 备注可选 |
| 已处理及后续状态只读，文案同管理端 | `actions` 为空 → `Read-only`；显示用服务端 `displayStatus`(STAFF_DISPLAY) |
| 导师端英文界面 | `features/supervisor/messages.ts` 集中管理 |
| 状态流转同时校验状态与角色 | 前端按钮显隐 + 服务端 `assertCan` 双层；409 兜底刷新 |
