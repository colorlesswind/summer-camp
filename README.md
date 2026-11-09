# summer-camp

```
summer-camp
├── server/   # Express + TypeScript 服务端（认证 /user + 申请表 /form，接口见 server/README.md）
└── ui/       # Vue 3 + Vite 前端 SPA（登录 / 学生申请表 / Application Status / 管理端 / 导师端）
```

## 服务端

```bash
cd server
cp .env.example .env
npm install
npm run migrate
npm run dev
```

详见 [server/README.md](./server/README.md)（第 10 节是申请表模块 `/form` 的接口说明）。

## 前端

```bash
cd ui
npm install
npm run dev        # http://localhost:5173
```

开发期由 Vite 把 `/user`、`/form`、`/healthz` 代理到 `http://localhost:3000`，请先启动服务端。
登录、学生申请表、路由与目录约定见 [ui/README.md](./ui/README.md)。

## 状态与 Application Status 页

学生端 `/applications` 按 `附件/application-status.png` 的表格形态实现，状态集合以 [笔试题-全栈.md](./笔试题-全栈.md) 的「简要流程 / 动作 × 状态（速查）」为准。

- 表格七列：Application Number、Name in English、Application Status、Return Reason、Due Date、Action、Time；不使用折叠/展开。
- 表格按状态流转日志展示**历史状态**：最新状态在最上面（加粗，带 Action），往下是该申请走过的历史状态；连续重复状态与折叠成同一文案的连续状态会合并，历史 `Pending for Update` 行展示该次退回原因。
- 学生端文案对齐附件：`Returned` → **Pending for Update**，`SupervisorRecommended` → **Recommended**；完整映射见 [server/README.md](./server/README.md) 第 10.4 节。
- Action 列：`Draft` → **Application Form**，`Returned` → **Update**，`OfferSent` → **Respond**（弹窗内 Accept / Decline，均二次确认）；其余状态只读。
- 附件里另有 6 个状态（Action Required: Confirm Attendance、Attendance Confirmed、Attendance Declined、Offer Lapsed、Reject Letter Sent、Withdrawn）本期未实现，标记为 **reserved**：不进入状态机、不参与匹配，前端只登记文案并置灰。
- `Due Date` 列按本次确认保留占位（需求未定义业务逻辑），值固定为 `-`，不实现相关功能。

界面截图见 `ui/.screenshots/status-*.png`（Draft、Pending for Update、Pending for Offer Acceptance + Respond 弹窗、Offer Declined、无申请占位行）。

## 管理端（Admin）

管理端对应笔试题 §2.2，管理员登录后落地 `/admin/applications`：

- **列表**：表格容器顶栏内置 `Status` 筛选（9 个状态全称）+ 关键词搜索 + 批量 Send Offer；筛选条件写入 URL（刷新 / 返回可还原），支持分页 20/50/100。
- **动作**：`PendingForPreliminaryScreening` 可 `Approve` / `Return`（原因必填）；`SupervisorRecommended` 可单条 `Send Offer` 或勾选批量（结果返回成功数 / 失败数 / 失败原因）。
- **详情**：字段只读（`presentation="text"`，长文本完整换行），带摘要、退回原因、Status History 与粘底操作条。
- 前端细节见 [ui/README.md](./ui/README.md) 的「管理端（Admin）」，方案与取舍见 [docs/admin-plan.md](./docs/admin-plan.md)。

## 导师端（Supervisor）

导师端对应笔试题 §2.3，导师登录后落地 `/supervisor/applications`，与管理端共用同一套列表 / 详情视觉：
`features/staff/` 放两端共用的只读表单、Status History、筛选栏与表格样式，`features/supervisor/` 放导师端差异部分。

- **可见范围**：服务端按 `reviewer_supervisor_id = 当前导师` 收窄，且只返回 `PendingSupervisorReview` 及之后的 6 个状态；初筛前的申请对导师不可见（详情 404）。
- **列表**：表格容器顶栏内置 `Status` 筛选（只列 6 个可见状态）+ 关键词搜索 + 分页；筛选写入 URL，刷新 / 返回可还原；默认 `All`。
- **动作**：`PendingSupervisorReview` 可 `Recommend`（二次确认）/ `Reject`（备注可选，写入 Status History）；均为单条，无批量与勾选列。
- **详情**：字段只读、分节导航吸顶、Status History + 粘底操作条；已处理及后续状态只读，文案同管理端。
- **异常**：非本人或未进入审核 → 404；导师账号未绑定导师档案 → 专用提示页（403 `supervisor_not_registered`）。
- 界面截图见 `ui/.screenshots/supervisor-*.png`（列表 / 筛选空态 / 详情）。
- 前端细节见 [ui/README.md](./ui/README.md) 的「导师端（Supervisor）」，方案与取舍见 [docs/supervisor-plan.md](./docs/supervisor-plan.md)。