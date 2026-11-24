# 现行业务约束（Invariants）

> 本文件是**现行业务约束的唯一登记表**。规则只在这里写一次，其他文档只引用 INV 编号，不复制原文。
> 权威顺序：可执行代码与测试 > `docs/decisions/` 中 `Accepted` 的 ADR > 本文件 > 说明性 README > `.agent-history/` 归档。
> 本文件与代码不一致时，先确认是代码错了还是本文件过期；未确认前以代码为准，并在 PR 中说明。

## 维护方式

- **改动约束**：直接改对应条目（规则 / 权威实现 / 测试锚点），并在「变更记录」追加一行 `YYYY-MM-DD · PR #编号 · 一句话`。
- **新增约束**：按顺序取下一个 INV 编号，补齐六个字段。
- **废弃约束**：不删除条目，把标题改为 `INV-XX（已废弃 YYYY-MM-DD）`，写明替代条目或 ADR。
- **跨模块或难以反转的决策**：另写 ADR，本文件只留一句话规则和链接。
- 每条只写「一句话可判定规则 + 代码锚点」，不写实现细节、不贴代码。

## 约束清单

### INV-01 跨业务域只能经过 service 协作

- **规则**：业务代码按域分目录；跨域只允许调用对方 service 的公开方法，禁止直接读写其他域的表。
- **权威实现**：`server/src/routes.ts`、`server/src/app.ts`
- **兜底层级**：代码结构 + review
- **相关 ADR**：ADR-0001
- **测试锚点**：无（结构性约束）
- **变更记录**：2026-11-24 建档（来源 ADR-0001）。

### INV-02 状态集合固定为 9 个，动作固定为 10 个

- **规则**：`ApplicationStatus` 只有 9 个值、`ApplicationAction` 只有 10 个值；新增/删除状态或动作属于破坏性变更，必须新增 ADR 并同步前端映射与测试矩阵。
- **权威实现**：`server/src/form/application.state.ts`
- **兜底层级**：编译期类型 + 测试
- **相关 ADR**：ADR-0002
- **测试锚点**：[test-matrix.md](./test-matrix.md) §4 真值表、§5 展示矩阵
- **变更记录**：2026-11-24 建档（来源 ADR-0002）。

### INV-03 流转矩阵只有一个来源，且必须两层校验

- **规则**：「角色 × 起始状态 → 目标状态」只由 `TRANSITIONS` 定义；路由层用 `requireRole` 粗筛，服务层用 `assertCan` 真正校验，两层都不可省。
- **权威实现**：`server/src/form/application.state.ts`、`server/src/middleware/authorize.ts`
- **兜底层级**：服务层（主）+ 路由层（粗筛）
- **相关 ADR**：ADR-0002
- **测试锚点**：[test-matrix.md](./test-matrix.md) §4、§6.3 SM、§6.9 SEC
- **变更记录**：2026-11-24 建档（来源 ADR-0002）。

### INV-04 权限错误的判定口径固定

- **规则**：角色不允许 → `403 role_forbidden`；角色允许但状态不允许 → `409 invalid_transition`（`detail` 含 `current`、`allowedFrom`）；两者不得混用。
- **权威实现**：`server/src/form/application.state.ts`、`server/src/common/errors.ts`
- **兜底层级**：服务层
- **相关 ADR**：ADR-0002
- **测试锚点**：[test-matrix.md](./test-matrix.md) §4 判定口径、§6.9 SEC
- **变更记录**：2026-11-24 建档（来源 ADR-0002）。

### INV-05 学生只能操作本人申请

- **规则**：学生读写任何申请前必须校验 `owner_user_id`；不一致 → `403 not_resource_owner`。
- **权威实现**：`server/src/form/application.state.ts`、`server/src/form/form.service.ts`
- **兜底层级**：服务层
- **相关 ADR**：ADR-0002、ADR-0004
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.9 SEC、§6.1 AUTH
- **变更记录**：2026-11-24 建档（来源 ADR-0002）。

### INV-06 导师可见范围从 `PendingSupervisorReview` 开始，未命中按 404 处理

- **规则**：导师只能看到 `PendingSupervisorReview` 及之后的状态；未分配或未进入审核的申请一律 `404 not_found`，不暴露存在性。
- **权威实现**：`server/src/form/form.display.ts`、`server/src/form/form.service.ts`
- **兜底层级**：服务层
- **相关 ADR**：ADR-0002
- **测试锚点**：[test-matrix.md](./test-matrix.md) §5、§6.5 SUP
- **变更记录**：2026-11-24 建档（来源 test-matrix R13）。

### INV-07 提交窗口只约束 `submit`

- **规则**：只有首次 `submit` 受 `submission_windows` 约束，窗口外 → `409 submission_window_closed`；`resubmit` 不受窗口限制。
- **权威实现**：`server/src/form/form.config.service.ts`、`server/src/form/application.state.ts`
- **兜底层级**：服务层
- **相关 ADR**：ADR-0003
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.2 STU、§6.8 CFG
- **变更记录**：2026-11-24 建档（来源 ADR-0003）。

### INV-08 表单字段、选项与提交窗口由数据库元数据驱动

- **规则**：字段、必填、选项、窗口存 `form_sections` / `form_fields` / `form_field_options` / `submission_windows`；前后端共用同一份元数据，新增字段走新增迁移，不改代码分支。
- **权威实现**：`server/src/form/form.config.repository.ts`、`server/src/form/form.config.service.ts`、`server/src/db/migrations/003_application_schema.sql`
- **兜底层级**：DB + 服务层校验
- **相关 ADR**：ADR-0003
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.8 CFG
- **变更记录**：2026-11-24 建档（来源 ADR-0003）。

### INV-09 名额只有一个写入口，且必须条件原子更新

- **规则**：占用/释放/迁移只能走 `supervisorQuota` 的 `acquire` / `release` / `transfer`，必须传调用方事务连接；禁止「先查余量再更新」，禁止自写 SQL。
- **权威实现**：`server/src/form/form.quota.ts`
- **兜底层级**：DB 条件更新 + `CHECK` 约束
- **相关 ADR**：ADR-0005
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.6 QTA、§6.9 SEC
- **变更记录**：2026-11-24 建档（来源 ADR-0005）。

### INV-10 名额变化与状态流转在同一事务内

- **规则**：`submit` 占用第一志愿名额；`resubmit` 同导师 no-op、换导师同一事务内释放+占用；`reject` / `decline_offer` 释放；`Returned` 期间继续占位；`accept_offer` 后转为最终占用。
- **权威实现**：`server/src/form/form.service.ts`、`server/src/form/form.quota.ts`
- **兜底层级**：DB 事务
- **相关 ADR**：ADR-0005
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.6 QTA
- **变更记录**：2026-11-24 建档（来源 ADR-0005）。

### INV-11 名额操作锁顺序固定，换导师按 id 升序

- **规则**：同一事务内先锁 `applications` 再锁 `supervisors`；换导师时按 supervisor id 升序执行释放/占用，避免交叉等待。
- **权威实现**：`server/src/form/form.quota.ts`、`server/src/form/form.service.ts`
- **兜底层级**：事务 + 固定顺序
- **相关 ADR**：ADR-0005
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.6 QTA-13、§6.9 SEC
- **变更记录**：2026-11-24 建档（来源 ADR-0005）。

### INV-12 名额计数有数据库兜底，且不得为负

- **规则**：`supervisors.quota_used` 满足 `0 <= quota_used <= quota_capacity`（`chk_supervisors_quota`）；重复释放最多停在 0。
- **权威实现**：`server/src/db/migrations/006_supervisor_quota.sql`、`server/src/form/form.quota.ts`
- **兜底层级**：DB `CHECK`
- **相关 ADR**：ADR-0005
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.6 QTA
- **变更记录**：2026-11-24 建档（来源 ADR-0005）。

### INV-13 一个账号只能有一份申请

- **规则**：同一 `user_id` 重复建单 → `409 application_exists`；申请编号首次保存时生成。
- **权威实现**：`server/src/form/form.service.ts`
- **兜底层级**：DB 唯一约束 + 服务层
- **相关 ADR**：ADR-0003
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.2 STU、§6.9 SEC
- **变更记录**：2026-11-24 建档（来源 test-matrix R02）。

### INV-14 登录态只用 HttpOnly Cookie，角色每次实时读取

- **规则**：access/refresh 均为 HttpOnly Cookie（refresh `Path=/user/token`）；`users.role` 每次请求实时读取，不写入 token；一个账号只有一种角色。
- **权威实现**：`server/src/user/auth/cookies.ts`、`server/src/middleware/authenticate.ts`、`server/src/user/user.types.ts`
- **兜底层级**：Cookie 属性 + 服务层
- **相关 ADR**：ADR-0004
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.1 AUTH、§6.9 SEC
- **变更记录**：2026-11-24 建档（来源 ADR-0004）。

### INV-15 所有写请求必须通过 CSRF 双提交与 Origin 校验

- **规则**：写请求必须带与非 HttpOnly CSRF cookie 一致的 `x-csrf-token`（否则 `403 csrf_token_invalid`）；跨站 Origin 必须在白名单内（否则 `403 origin_not_allowed`）。不得为调试放开。
- **权威实现**：`server/src/middleware/csrf.ts`、`server/src/middleware/trusted-origin.ts`
- **兜底层级**：中间件
- **相关 ADR**：ADR-0004
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.1 AUTH、§6.9 SEC
- **变更记录**：2026-11-24 建档（来源 ADR-0004）。

### INV-16 认证失败对外统一为 `invalid_grant`

- **规则**：用户不存在、密码错误、验证码错误等登录失败一律返回 `401 invalid_grant`，不暴露差异；5xx 只返回通用文案。
- **权威实现**：`server/src/common/errors.ts`、`server/src/middleware/error-handler.ts`
- **兜底层级**：服务层
- **相关 ADR**：ADR-0004
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.1 AUTH
- **变更记录**：2026-11-24 建档。

### INV-17 响应信封格式固定

- **规则**：成功 `{ code: 0, message: "ok", data }`，创建接口 HTTP 201、其余 200；失败为 RFC7807 风格 `{ status, code, message, detail, errors? }`。
- **权威实现**：`server/src/common/response.ts`、`server/src/middleware/error-handler.ts`
- **兜底层级**：服务层
- **相关 ADR**：ADR-0004
- **测试锚点**：[test-matrix.md](./test-matrix.md) §2.4
- **变更记录**：2026-11-24 建档（来源 test-matrix §2.4）。

### INV-18 错误码是契约，新增或改名需走 ADR

- **规则**：`validation_failed`、`invalid_option`、`invalid_transition`、`submission_window_closed`、`quota_full`、`application_exists`、`role_forbidden`、`not_resource_owner`、`csrf_token_invalid`、`origin_not_allowed`、`rate_limited` 等错误码的语义与 HTTP 状态码不得随意变更；破坏性变更先写 ADR，再同步前端与测试。
- **权威实现**：`server/src/common/errors.ts`、`server/src/middleware/error-handler.ts`
- **兜底层级**：服务层 + 测试断言
- **相关 ADR**：ADR-0002、ADR-0004
- **测试锚点**：[test-matrix.md](./test-matrix.md) §2.4、§4 判定口径
- **变更记录**：2026-11-24 建档。

### INV-19 展示文案以服务端 `displayStatus` 为准

- **规则**：内部 `status` 原样返回，前端判断逻辑用 `status`；学生端折叠规则（如两个审核中状态都显示 `Under Review`）由服务端决定，前端常量仅作兜底且必须与之一致。
- **权威实现**：`server/src/form/form.display.ts`、`ui/src/constants/application.ts`
- **兜底层级**：服务端返回 + 前端兜底
- **相关 ADR**：ADR-0002
- **测试锚点**：[test-matrix.md](./test-matrix.md) §5 展示矩阵、§6.10 UI
- **变更记录**：2026-11-24 建档（来源 ADR-0002）。

### INV-20 数据库迁移只增不改

- **规则**：已发布的迁移文件不得修改；新增迁移必须同时能在空库与存量库执行，并说明回滚/补偿方式。
- **权威实现**：`server/src/db/migrations/`、`server/src/db/migrate.ts`
- **兜底层级**：迁移执行记录
- **相关 ADR**：ADR-0001、ADR-0005
- **测试锚点**：空库 `npm run migrate` + 受影响集成测试
- **变更记录**：2026-11-24 建档。

### INV-21 请求参数与资源 ID 校验口径固定

- **规则**：资源 ID 必须是 26 位 ULID，否则 `400 validation_failed`；字段校验以表单元数据为准，未知字段拒绝。
- **权威实现**：`server/src/form/form.schema.ts`、`server/src/form/form.validation.ts`
- **兜底层级**：服务层
- **相关 ADR**：ADR-0003
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.8 CFG、§4 判定口径
- **变更记录**：2026-11-24 建档。

### INV-22 前端可编辑状态与按钮显隐只是体验层

- **规则**：学生仅能在 `Draft` / `Returned` 编辑整份表单，其余状态只读；按钮显隐可复用纯函数，但不得作为唯一校验，服务端必须独立校验。
- **权威实现**：`ui/src/constants/application.ts`、`server/src/form/application.state.ts`
- **兜底层级**：服务端
- **相关 ADR**：ADR-0002
- **测试锚点**：[test-matrix.md](./test-matrix.md) §6.2 STU、§6.10 UI
- **变更记录**：2026-11-24 建档。
