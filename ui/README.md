# Summer Camp · UI

港科大（广州）夏令营报名系统的前端 SPA：Vue 3 + TypeScript + Vite + Ant Design Vue 4 + Vue Router 4 + Pinia + axios。

当前阶段已完成登录页、学生端申请表（配置驱动、Save / Submit / Resubmit、只读状态）、Application Status 表格页（状态 / 退回原因 / 动作 / 时间，Accept / Decline 带二次确认），以及管理端申请列表与详情（status 筛选、Approve / Return、单条与批量 Send Offer、字段只读审阅）；导师端列表与审核页面仍以占位页预留，下一阶段填充。

## 快速开始

前置条件：

- Node.js ≥ 20.19（本机验证版本 22.14）
- 服务端已启动，默认 `http://localhost:3000`

```bash
cd ui
npm install
npm run dev        # http://localhost:5173
```

其他脚本：

| 命令                | 说明                                 |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Vite 开发服务器（端口 5173，严格）   |
| `npm run build`     | `vue-tsc` 类型检查 + 生产构建到 `dist/` |
| `npm run preview`   | 预览生产构建（端口 4173；需把该来源加入服务端 `CORS_ORIGINS`，`.env.example` 已包含） |
| `npm run typecheck` | 仅做 TypeScript 类型检查             |

## 环境变量

| 变量                    | 说明                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `VITE_API_BASE_URL`     | 请求前缀，默认 `/`。**不能改成 `/api`**，原因见下方 Cookie 说明 |
| `VITE_API_PROXY_TARGET` | 仅开发期：Vite 把 `/user`、`/form`、`/healthz` 代理到该地址   |

开发期代理配置在 [`vite.config.ts`](./vite.config.ts)。生产环境由 Nginx 承担同样的转发。

> **为什么不能加 `/api` 前缀**：服务端把 refresh token 写在 `Path=/user/token` 的 Cookie 里。
> 如果浏览器请求的是 `/api/user/token/refresh`，该 Cookie 不会被携带，access token 过期后就无法刷新。
> 因此浏览器必须直接请求 `/user/*`、`/form/*`，与页面同源。

## 目录结构

```text
ui/
├── resource/logo.png              # 校徽（构建时通过 @resource 别名打包）
├── src/
│   ├── main.ts                    # 应用装配：pinia / AntD 按需组件 / router
│   ├── App.vue                    # ConfigProvider（主题 token）
│   ├── theme.ts                   # 主色、圆角、控件高度
│   ├── api/
│   │   ├── http.ts                # axios、CSRF、401 单飞刷新、会话失效回调
│   │   ├── problem.ts             # problem+json → ApiError（英文文案）
│   │   ├── auth.ts                # /user/otp、/user/logon、/user/me、/user/logout
│   │   └── application.ts         # /form/schema、详情、Save、Submit、Resubmit、Accept / Decline、导师候选
│   ├── assets/styles/             # reset / CSS 变量 / 全局排版
│   ├── components/
│   │   ├── BrandHeader.vue        # 校徽 + 功能枢纽 FUNCTION HUB
│   │   └── AuthCard.vue           # 登录卡片外壳
│   ├── composables/               # useCountdown、useMediaQuery
│   ├── constants/                 # 应用常量、角色首页映射、学生状态文案/颜色
│   ├── features/auth/
│   │   ├── views/LoginView.vue
│   │   ├── components/            # 学生表单、员工表单、底部按钮
│   │   ├── styles/login.css
│   │   └── messages.ts            # 英文文案集中管理
│   ├── features/application/
│   │   ├── views/                 # StudentEntryView、ApplicationStatusView、ApplicationFormView
│   │   ├── components/            # FormField、FormFieldGroup、RepeatableSection、StatementSection、SectionNav、StudentSidebar
│   │   ├── composables/           # useApplicationForm、useSectionScrollSpy
│   │   ├── field-groups.ts        # group_code 合并成一行/一列
│   │   ├── form-values.ts         # hydrate / payload 纯函数（学生端与管理端共用）
│   │   ├── messages.ts            # 页面文案与字段级错误翻译
│   │   └── styles/                # application-shell.css（学生端共用外壳）、application-form.css
│   ├── features/admin/
│   │   ├── views/                 # AdminApplicationsView（列表）、AdminApplicationDetailView（详情）
│   │   ├── components/            # 筛选栏、表格、Return 弹窗、批量结果、只读表单、Status History
│   │   ├── composables/           # useAdminApplications、useAdminApplicationDetail
│   │   ├── messages.ts            # 管理端英文文案与状态说明
│   │   └── styles/admin.css       # 管理端列表 / 详情样式
│   ├── layouts/                   # AuthLayout / MainLayout（支持 fullBleed）
│   ├── pages/                     # 403、404、导师端占位页
│   ├── router/                    # 路由表与守卫
│   ├── stores/auth.ts             # 会话状态与登录动作
│   ├── types/                     # 与后端对齐的 DTO（user / application / api）
│   └── utils/                     # cookie、csrf、redirect 校验
├── env.d.ts
├── vite.config.ts
└── tsconfig*.json
```

下一阶段会在 `features/` 下新增：

```text
features/supervisor/     # 导师端：名下申请列表、Recommend / Reject
```

## 路由

| 路径                            | 角色       | 说明                              |
| ------------------------------- | ---------- | --------------------------------- |
| `/login`                        | 游客       | 登录页（学生 / 员工模式切换）     |
| `/`                             | 登录       | 按角色重定向到各自首页            |
| `/start`                        | student    | 登录后分流：可填表 → `/applications/new`，其余 → `/applications` |
| `/applications`                 | student    | Application Status 表格（状态 / 退回原因 / 动作 / 时间） |
| `/applications/new`             | student    | 新建申请表；已有申请时自动跳到详情 |
| `/applications/:id`             | student    | 单页申请表（配置驱动，按状态只读） |
| `/admin/applications`           | admin      | 申请列表：status 筛选、关键词搜索、分页、批量 Send Offer |
| `/admin/applications/:id`       | admin      | 申请详情：字段只读 + Approve / Return / Send Offer |
| `/supervisor/applications`      | supervisor | 占位：分配给当前导师的申请        |
| `/supervisor/applications/:id`  | supervisor | 占位：申请详情                    |
| `/403` `/404`                   | 公开       | 错误页                            |

守卫逻辑：首次导航先 `GET /user/me` 恢复会话；未登录访问受保护路由会跳 `/login?redirect=...`；角色不匹配跳 `/403`；已登录访问 `/login` 直接回角色首页。

## 学生申请表

登录后先进入 `/start`：

1. `GET /form/applications/mine` 没有申请，或状态是 `Draft` / `Returned` → `/applications/new`（已有申请时再自动跳到 `/applications/:id`）；
2. 其余状态（审核中、Offer 已发/已接受/已拒绝）→ `/applications` 的 Application Status。

页面能力：

- **配置驱动**：`GET /form/schema` 返回的小节、字段、必填、选项、`group_code`、`dependsOnField` 决定页面结构；前端不写死字段。
- **当前启用 6 个小节**：Personal Particulars、Program Choice、Personal Statement、Publications、Work Experience、Statement。Education / Awards / Supporting Documents / English Proficiency 在服务端 `is_enabled=0`，下一阶段再启用。
- **分节导航**：顶部横栏按小节生成，滚动时用 scroll-spy 更新 active 下划线；点击可平滑跳转，横栏吸顶。
- **组合字段**：`nameEn`、`idDocument`、`phone`、`expPeriod` 按 `group_code` 合并成一行/一列。
- **可重复小节**：Publications / Work Experience 支持增删行，最多 20 行；提交时空行会被服务端丢弃。
- **Save**：不校验必填；首次 Save 用 `POST /form/applications` 创建 Draft 并生成 Application No.，之后用 `PUT /form/applications/:id`。
- **Submit / Resubmit**：先做客户端必填与跨字段校验，再 Save，最后调用 `submit` / `resubmit`；服务端校验失败时把字段级错误映射到对应控件并展示英文文案。
- **只读状态**：服务端 `editable=false` 或状态不是 `Draft` / `Returned` 时，字段全部禁用，只保留 Previous；`OfferSent` 的 Accept / Decline 在 Application Status 页完成。
- **提交时间段**：`meta.canSaveDraft` / `meta.submissionWindow` 控制 Save、Submit 的显示与服务端 409 提示。
- **未保存保护**：表单 dirty 时离开页面会二次确认；首次 Save 成功后 URL 自动从 `/applications/new` 替换为 `/applications/:id`，刷新可恢复。
- **导师候选**：`GET /form/supervisors?programCode=...` 按 Program 过滤，下拉支持输入搜索；换 Program 会清空对应 Supervisor，第二志愿会排除第一志愿。

页面文案与字段级错误翻译集中在 [`features/application/messages.ts`](./src/features/application/messages.ts)，日期使用 `dayjs`。

## Application Status（学生端列表）

`/applications` 按 `附件/application-status.png` 的表格形态实现（`features/application/views/ApplicationStatusView.vue`），状态集合仍以笔试题「简要流程 / 动作 × 状态」为准。

- **布局**：学生端共用外壳（`StudentSidebar` + `styles/application-shell.css`）：左栏 SUMMER CAMP / Application Status / Application Form，右栏说明文案 + 表格。
- **列**：Application Number、Name in English（统一转大写）、Application Status、Return Reason、Due Date、Action、Time（`YYYY-MM-DD HH:mm:ss`，取 `status_changed_at`）。
- **行**：按状态流转日志逐行展示「走过的状态」（最新在前、当前状态加粗），因此一份申请会有多行；连续重复的内部状态只保留一次，折叠成同一文案的连续状态（如两个 Under Review）也合并；历史行不带 Action，只有当前行可操作。
- **空状态**：还没有申请时给一行 `Draft` 占位，点 `Application Form` 进入新建。
- **Action**：`Draft` → `Application Form`，`Returned` → `Update`，`OfferSent` → `Respond`（弹窗内 Accept Offer / Decline Offer，再各弹一次确认，成功后本行状态即时更新）；其余状态显示 `-`。
- **退回原因**：`Pending for Update` 行展示该次退回的 `Return Reason:` + 原因全文（历史行用它自己那次 Return 的备注）。
- **Due Date**：按本次确认保留该列占位，不承载业务逻辑，值固定 `-`。
- **reserved 状态**：附件里的 Action Required: Confirm Attendance / Attendance Confirmed / Attendance Declined / Offer Lapsed / Reject Letter Sent / Withdrawn 本期不实现，仅在 `constants/application.ts` 的 `RESERVED_STATUS_META` 登记文案（灰色 tone），不参与状态匹配，页面不渲染这些行。

## 管理端（Admin）

管理端对应需求 §2.2，路由 `/admin/applications`（列表）与 `/admin/applications/:id`（详情），代码在 `features/admin/`。

- **布局**：沿用 `MainLayout`（顶部品牌栏 + 当前账号 / 角色 / 登出），不加左侧栏。筛选器是表格容器自己的顶栏：`Status 下拉 + 关键词搜索 + Reset + 批量 Send Offer`，与表格、分页共用同一个 1px 边框容器，视觉沿用学生端表格的细线、13px 与 `#fafafa` 表头。
- **URL 即筛选状态**：`?status=SupervisorRecommended&keyword=zhang&page=2&pageSize=20`。刷新、浏览器前进/后退、从详情返回都能还原；关键词 300ms 防抖；换筛选或换页清空批量选择。
- **列**：选择、Application No.（链接进详情）、Applicant（姓名 + 邮箱）、First Choice、Second Choice、Status（Tag，文案取服务端 `displayStatus`）、Last Updated、Action。
- **动作矩阵**：`PendingForPreliminaryScreening` → `Approve`（二次确认）/ `Return`（原因必填弹窗，max 1000）；`SupervisorRecommended` → `Send Offer`（单条二次确认）且可勾选批量；其余状态只读。列表行与详情页共用同一套规则，按钮显隐以详情 `actions` 为准，服务端仍会二次校验。
- **批量 Send Offer**：只允许勾选 `SupervisorRecommended`，仅作用于当前页；调用 `POST /form/offers/batch`，成功数 / 失败数 / 失败明细用弹窗展示，失败原因按 `code` 翻译为英文。
- **详情**：返回链接 + 编号 / 状态 Tag + 申请人 / 提交时间 + 摘要（两个志愿、评审导师、最近更新时间）+ 退回原因提示 + 吸顶分节导航 + 只读表单 + Status History + **粘底操作条**（长表单读到底仍可操作）。
- **只读渲染**：`FormField` 新增 `presentation="text"`（默认 `control`，学生端行为不变）：长文本完整换行、选项显示 label、日期格式化、URL 可点击、声明显示 Agreed / Not agreed，避免把 8000 字个人陈述压进灰色 textarea。
- 管理端状态文案 / 颜色在 `constants/application.ts` 的 `STAFF_STATUS_META`，已与服务端 `form/form.display.ts` 的 `STAFF_DISPLAY` 对齐。

## 登录说明

- **学生**：邮箱 + 6 位验证码。先点 `Send Verification Code`，验证码 1 小时有效（服务端 `OTP_TTL_SECONDS=3600`），重发冷却 60 秒；首次登录由服务端自动开户。
- **Admin / Supervisor**：点击卡片底部 `Admin / Supervisor login` 切换到邮箱 + 密码模式，账号由服务端环境变量预置（见 `server/.env` 的 `BOOTSTRAP_*`）。
- 服务端错误文案是中文，前端在 `api/problem.ts` 按 `code` 统一映射为英文；未知错误走兜底文案。
- 登录成功后优先回 `?redirect=`（仅允许站内路径），否则按角色回首页。

## 会话与请求

- access / refresh token 只存在于 HttpOnly Cookie；前端读不到，也不写 localStorage。
- 页面刷新后靠 `GET /user/me` 恢复会话。
- 非 GET 请求自动读取 `sc_csrf` Cookie 并带 `X-CSRF-Token` 头（双提交校验）。
- 401 时做一次「单飞刷新 + 重放」：多个并发 401 共享同一个刷新请求；刷新失败才清空状态并回登录页。
- `MainLayout` 提供当前邮箱、角色标签与登出。

## 生产部署

```bash
npm run build
# 将 dist/ 交给 Nginx 等静态服务器
```

Nginx 参考配置（SPA fallback + 三个 API 前缀）：

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /user/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /form/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location = /healthz {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

> 生产环境服务端会下发 `Secure` Cookie，必须通过 HTTPS 访问；同时把 `APP_ORIGIN`、`CORS_ORIGINS` 配成实际前端域名。

## 约定与后续

- Ant Design Vue 采用**按需注册**（见 `src/main.ts`）；新增页面用到新组件时在 `main.ts` 追加 `app.use(...)`。
- 所有 UI 文案为英文；登录文案在 `features/auth/messages.ts`，申请表文案在 `features/application/messages.ts`，管理端文案在 `features/admin/messages.ts`。
- 学生端状态文案、Tag 颜色与表格色调在 `constants/application.ts`（`STUDENT_STATUS_META`）；管理端状态文案与颜色在同文件的 `STAFF_STATUS_META`（对齐服务端 `STAFF_DISPLAY`）；未实现的 6 个附件状态登记在 `RESERVED_STATUS_META`（灰色，reserved）。
- 只读审阅用 `FormField` 的 `presentation="text"`（默认 `control`）；学生端只读仍用 disabled 控件，行为不变。
- 占位页（`pages/PlaceholderView.vue`）目前仅用于导师端，完成导师页面后删除。
- 未引入 i18n 库，因为当前只要求英文界面。
