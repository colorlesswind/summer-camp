# summer-camp

```
summer-camp
├── server/   # Express + TypeScript 服务端（认证 /user + 申请表 /form，接口见 server/README.md）
└── ui/       # Vue 3 + Vite 前端 SPA（登录 / 学生申请表 / Application Status；管理端与导师端待实现）
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