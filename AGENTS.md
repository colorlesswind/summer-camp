# AGENTS.md

> 本文件是本仓库所有 AI agent（含 `.github/agents/` 下的自定义角色与通用 agent）的唯一工作规则。
> 数据层：[`docs/invariants.md`](./docs/invariants.md)（现行约束）+ [`docs/decisions/`](./docs/decisions/)（决策 ADR）+ `.agent-history/`（只读归档）+ PR 描述 / `CHANGELOG.md`（变更事实）。
> 文档分工见 [`docs/README.md`](./docs/README.md)。角色文档与本文件冲突时，以本文件为准。
>
> **权威顺序（冲突时从高到低）**：可执行代码与测试 > `docs/decisions/` 中 `Accepted` 的 ADR > `docs/invariants.md` > `server/README.md` 等说明 > `.agent-history/` 归档（仅背景，不构成约束）。

## 1. 项目速览

| 目录 | 内容 |
| --- | --- |
| `server/` | Express 4 + TypeScript（strict）、MySQL 8、zod、pino；按业务域分 `user/`、`form/`，辅以 `common/`、`infra/`、`middleware/`、`db/` |
| `ui/` | Vue 3 + Vite SPA；按 `features/` 分 auth、application、admin、supervisor、staff |
| `docs/` | [文档导航](./docs/README.md)、[现行约束](./docs/invariants.md)、[测试矩阵](./docs/test-matrix.md)、[ADR](./docs/decisions/README.md) |
| `.agent-history/` | **只读归档**（2026-11-24 冻结）：[说明](./.agent-history/ARCHIVE.md) + 按年份-季度分目录 |
| `CHANGELOG.md` | 面向使用者的变更记录 |
| `.github/agents/` | 角色契约（architecture / frontend / nodejs / sql-design / uiux / func-test） |

接口、错误码以 [server/README.md](./server/README.md) 为准；业务规则与用例映射以 [docs/test-matrix.md](./docs/test-matrix.md) 为准。

---

## 2. 强制规则：改已有业务逻辑前先查约束

**修改任何涉及已有业务逻辑的代码前，先查 [`docs/invariants.md`](./docs/invariants.md) 与 `docs/decisions/` 中 `Accepted` 的 ADR；如有冲突，停止并说明。**

执行顺序（缺一步即视为未完成检索）：

1. 打开 [`docs/invariants.md`](./docs/invariants.md)，按 §3 边界地图定位相关 INV 条目，读「规则 / 权威实现 / 测试锚点」；
2. 打开条目引用的 ADR（只认 `Accepted`；`Superseded` / `Deprecated` 仅作背景），并做一次关键词检索：

   ```bash
   rg -n "<模块名|状态名|错误码|表名|接口路径>" docs/invariants.md docs/decisions
   ```

   无 `rg` 时用编辑器搜索或 `git grep`，检索范围不变。
3. 读权威代码位置与对应测试，确认约束在代码中的实际形态；
4. 需要历史背景时再检索归档：`rg -n "<关键词>" .agent-history`。归档是**历史事实，不是现行约束**，命中后必须回到第 1–3 步确认。

判定为「已有业务逻辑」的范围（命中任一即适用）：

- 申请状态流转、动作权限与状态机常量；
- 名额/配额（占用、迁移、释放、并发）；
- 提交时间窗口、申请编号生成；
- 字段必填、类型、跨字段校验规则与错误码；
- 数据库表结构、约束、索引与已发布迁移；
- 对外接口契约（路径、请求/响应字段、状态码、错误码）；
- 前端状态文案、按钮显隐与流程分支。

**检索结果为空不等于无约束**：此时仍须读代码与 [docs/test-matrix.md](./docs/test-matrix.md)，并在 PR 描述中写明「未命中既有约束」及你据以判断的代码位置。

新增功能同样要检索：同一业务规则只能有一个权威实现，禁止再写一套平行的状态判断、名额计算或校验。

### 2.1 冲突处理

当检索结果与本次需求无法同时成立（规则、状态流转、权限、名额、字段校验、错误码、DB 约束、接口契约任一项冲突），**停止编码**，先输出：

- **冲突点**：`文件:行` / ADR 编号 / 原规则 vs 新需求；
- **影响面**：受影响的接口、页面、迁移、测试；
- **选项**：A 保持旧规则、改实现路径；B 新增 ADR 取代旧决策；C 缩小需求范围；
- **推荐方案**与需要用户确认的点。

未检索、未说明冲突就动手改，属于违规。

---

## 3. 业务边界地图

| 业务域 | 权威实现位置 | 检索关键词 | 相关 ADR | 不变量 |
| --- | --- | --- | --- | --- |
| 模块装配与路由 | `server/src/app.ts`、`server/src/routes.ts` | `/user`、`/form`、`createRouter` | ADR-0001 | INV-01 |
| 状态机与动作权限 | `server/src/form/application.state.ts`（`TRANSITIONS`、`assertCan`、`assertOwnership`） | `invalid_transition`、`role_forbidden`、状态名 | ADR-0002 | INV-02 ~ INV-06、INV-22 |
| 状态流转事务 | `server/src/form/form.service.ts` | `transition`、`applyQuota` | ADR-0002、ADR-0005 | INV-03、INV-10 |
| 名额/配额 | `server/src/form/form.quota.ts`、`supervisors` 表、`006_supervisor_quota.sql` | `quota`、`quota_full`、`quota_supervisor_id` | ADR-0005 | INV-09 ~ INV-12 |
| 表单字段与选项 | `server/src/form/form.config.*`、`form_sections` / `form_fields` / `form_field_options` | `form_fields`、`form_config`、`widget` | ADR-0003 | INV-08、INV-21 |
| 提交时间窗口 | `submission_windows` 表、`server/src/form/form.config.service.ts`、`application.state.ts` 窗口纯函数 | `submission_windows`、`opens_at`、`submission_window_closed` | ADR-0003 | INV-07 |
| 认证与会话 | `server/src/user/auth/**`、`server/src/user/oauth/**`、`server/src/middleware/authenticate.ts` | `cookie`、`refresh`、`otp`、`oauth` | ADR-0004 | INV-14、INV-16 |
| CSRF / Origin | `server/src/middleware/csrf.ts`、`server/src/middleware/trusted-origin.ts` | `x-csrf-token`、`csrf`、`origin` | ADR-0004 | INV-15 |
| 角色与粗筛权限 | `server/src/user/user.types.ts`（`USER_ROLES`）、`server/src/middleware/authorize.ts` | `requireRole`、`users.role` | ADR-0002、ADR-0004 | INV-03、INV-14 |
| 错误模型与响应信封 | `server/src/common/errors.ts`、`server/src/common/response.ts` | 错误码、`AppError` | — | INV-17、INV-18 |
| 状态展示文案 | `server/src/form/form.display.ts`、`ui/src/constants/application.ts` | `displayStatus`、`STUDENT_STATUS_META` | ADR-0002 | INV-19、INV-22 |
| 数据库结构与迁移 | `server/src/db/migrations/*.sql`、`server/src/db/migrate.ts` | 表名、`ALTER TABLE` | ADR-0001、ADR-0003、ADR-0005 | INV-12、INV-20 |
| 前端业务分支 | `ui/src/features/**`、`ui/src/api/**` | feature 名、接口路径 | — | INV-19、INV-22 |

---

## 4. 改动约束

- **单一事实来源**：状态、角色、错误码、字段定义各只有一处权威实现，并登记在 [`docs/invariants.md`](./docs/invariants.md)。发现第二份时先合并，不要在其旁边再加第三份。
- **状态机变更**：必须同时更新 `TRANSITIONS`、前端映射（`ui/src/constants/application.ts`）、[docs/test-matrix.md](./docs/test-matrix.md) 的状态矩阵与 [`docs/invariants.md`](./docs/invariants.md) 的 INV-02 ~ INV-06 / INV-19，并按 [docs/decisions/README.md](./docs/decisions/README.md) 的规则新增 ADR。
- **迁移只增不改**：已发布的 `001`–`006` 不修改；新增迁移必须能在空库执行、也能在存量库升级，且说明回滚/补偿方式。
- **契约变更**：路径、字段名、响应信封、错误码的变更是破坏性变更，先按 [docs/decisions/README.md](./docs/decisions/README.md) 的规则写 ADR，再同步 `server/README.md`、前端类型与 INV-17 / INV-18。
- **测试是不变量守卫**：不要为了让测试通过而放宽既有断言；行为变了就改测试并说明原因。
- **安全基线**：鉴权失败即拒绝；不可见资源避免存在性泄漏；敏感信息不进日志。

---

## 5. 验证要求

| 改动范围 | 最低验证 |
| --- | --- |
| `server/src/**` | `cd server; npm run typecheck; npm test`（涉及接口时补 `npm run smoke`） |
| `ui/src/**` | `cd ui; npm run typecheck; npm test` |
| 数据库迁移 | 空库执行 `cd server; npm run migrate`，并跑受影响的集成测试 |
| 仅文档 | 无需构建；跑 `node scripts/check-docs.mjs`，确保相对链接可解析、INV / ADR 引用存在 |

---

## 6. 收工（必须）

执行代码或文档改动的 agent 在结束前完成：

1. **约束有变化** → 就地更新 [`docs/invariants.md`](./docs/invariants.md) 对应 INV 条目（规则、权威实现、测试锚点、变更记录），**不新建文件**；没有变化则不动。
2. **跨模块契约或难以反转的决策变化** → 先读 [docs/decisions/README.md](./docs/decisions/README.md) 的规则（编号单调递增不复用、状态定义、正文七段结构、`Superseded` 双向回链、禁止直接改写已 `Accepted` 的结论），再新增 `ADR-XXXX-<slug>.md`。
3. **填写 PR 描述** → 按 [`.github/pull_request_template.md`](./.github/pull_request_template.md) 填写；「验证」只写真实命令与输出，「业务不变量」列出本次增删改的 INV 编号。纯文档或重构在模板中勾选 `skip-changelog`。
4. **更新 [`CHANGELOG.md`](./CHANGELOG.md) 的 `[Unreleased]`**（除非第 3 步已勾选 `skip-changelog`）。
5. 未完成项与风险写进 PR 描述的「风险与未决」，并在回复中明确告知用户。

流程要求：

- 变更走分支 + PR，不直接 push `main`；PR 描述是变更事实的唯一载体，squash 后进入提交信息。
- **不要新建会话记录、计划、笔记、进度类 markdown**。历史事实由 git 历史 + PR 描述承载。
- `.agent-history/` 已冻结为只读归档，只在需要历史背景时检索。

---

## 7. 不要做的事

- 不要新建会话记录、计划、笔记或进度类 markdown：约束进 `docs/invariants.md`，决策进 `docs/decisions/`，变更事实进 PR 描述与 `CHANGELOG.md`。
- 不要在 `.agent-history/` 写入新文件或粘贴大段 diff、完整日志、密钥；该目录只读。
- 不要把 `.agent-history/` 的记录当作现行约束：它只是历史背景。
- 不要静默修改已 `Accepted` 的 ADR；变更走新 ADR + 旧 ADR 标 `Superseded`，写法遵循 [docs/decisions/README.md](./docs/decisions/README.md)。
- 不要让同一条规则出现第二份原文：`docs/invariants.md` 写一次，其他文档只引用 INV 编号。
- 不要把「本次改动没碰到某个模块」当作无需检索的理由：先按 §3 确认边界。
