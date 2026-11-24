# 2026-11-22 · baseline-invariants

- 日期：2026-11-22
- 触发需求：建立 `.agent-history/` 时补录现有业务基线，让后续会话有可检索的起点。
- 涉及角色：architecture / nodejs / sql-design / frontend（只读盘点）
- 关联 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0005
- 关联历史：无（本记录是第一条）

> 本记录是**回溯补录**，不是当时会话的实时日志；内容以代码基线 `0a63c1e` 为准。
> 后续若与代码不一致，以代码为准，并新增记录说明差异。

## 1. 目标与非目标

- 目标：固化当前已实现的业务不变量与权威实现位置，供后续改动前检索。
- 非目标：不改变任何行为；不补写历史会话的取舍过程。

## 2. 检索结论

- 读过的历史记录：无（首次建立）
- 读过的 ADR：无（同期补录）
- 依据：[docs/test-matrix.md](../../docs/test-matrix.md)、`server/src/form/application.state.ts`、`form.quota.ts`、`form.service.ts`、`form.display.ts`、`user/auth/cookies.ts`、`middleware/csrf.ts`、`db/migrations/003`–`006`

## 3. 改动清单

| 文件 | 改动摘要 |
| --- | --- |
| `.agent-history/INDEX.md`、`_TEMPLATE.md`、本文件 | 建立会话历史机制（文档） |
| `AGENTS.md`、`docs/decisions/**` | 规则与 ADR（文档） |

## 4. 业务不变量（前后对比）

| 规则 | 改动前 | 改动后 | 兜底层级 |
| --- | --- | --- | --- |
| 状态机 9 状态 × 10 动作 | 已实现 | 不变 | 服务（`TRANSITIONS` + `assertCan`） |
| 角色不符 403 `role_forbidden`；状态不符 409 `invalid_transition` | 已实现 | 不变 | 服务 |
| 学生只能操作本人申请，403 `not_resource_owner` | 已实现 | 不变 | 服务（`assertOwnership`） |
| 名额占用：`submit` 占用；`resubmit` 迁到新导师；`reject` / `decline_offer` 释放；`Returned` 期间继续占位；`accept_offer` 后转为最终占用 | 已实现 | 不变 | DB（条件原子 UPDATE + `chk_supervisors_quota`） |
| 名额并发：只允许 `UPDATE ... WHERE quota_used < quota_capacity`，禁止先 SELECT 再 UPDATE | 已实现 | 不变 | DB 行锁 |
| 锁顺序：先 `applications` 后 `supervisors`；换导师按 supervisor id 升序 | 已实现 | 不变 | 服务 |
| 提交窗口只约束首次 `submit`，`resubmit` 不受限；窗口外 409 `submission_window_closed` | 已实现 | 不变 | 服务 + DB（`submission_windows`） |
| 字段/必填/选项由 `form_sections` / `form_fields` / `form_field_options` 驱动 | 已实现 | 不变 | DB + 服务 |
| 认证：access token HttpOnly + SameSite=Lax；refresh token HttpOnly + Strict + `Path=/user/token`；CSRF cookie 非 HttpOnly | 已实现 | 不变 | 服务 |
| CSRF：双提交，请求头 `x-csrf-token` 必须与 cookie 常量时间相等 | 已实现 | 不变 | 中间件 |
| 一人一角色，角色存 `users.role`，每次请求实时读取，不写入 token | 已实现 | 不变 | DB + 中间件 |
| 展示文案：内部 `status` 原样返回，前端展示用 `displayStatus` | 已实现 | 不变 | 服务（`form.display.ts`） |
| 迁移可空库执行、可存量升级 | 已实现 | 不变 | `db/migrate.ts` |

### 4.1 状态机（`server/src/form/application.state.ts`）

| 动作 | 角色 | 起始状态 | 目标状态 |
| --- | --- | --- | --- |
| `save` | student | `Draft` / `Returned`，或记录不存在（首次创建） | 保持（`to: null`，首次为 `Draft`） |
| `submit` | student | `Draft` | `PendingForPreliminaryScreening` |
| `resubmit` | student | `Returned` | `PendingForPreliminaryScreening` |
| `return` | admin | `PendingForPreliminaryScreening` | `Returned` |
| `approve` | admin | `PendingForPreliminaryScreening` | `PendingSupervisorReview` |
| `recommend` | supervisor | `PendingSupervisorReview` | `SupervisorRecommended` |
| `reject` | supervisor | `PendingSupervisorReview` | `SupervisorRejected` |
| `send_offer` | admin | `SupervisorRecommended` | `OfferSent` |
| `accept_offer` | student | `OfferSent` | `OfferAccepted` |
| `decline_offer` | student | `OfferSent` | `OfferDeclined` |

## 5. 兼容性与迁移

- 接口 / 字段 / 错误码：无变化。
- 迁移脚本：无新增；已发布 `001`–`006` 视为冻结，后续只追加。
- 回滚方式：删除 `.agent-history/` 与 `docs/decisions/`、`AGENTS.md` 即可，不影响运行时。

## 6. 验证

| 命令 | 结果 |
| --- | --- |
| `cd server; npm run typecheck` | 未执行（本次仅新增文档，无源码改动） |
| `cd ui; npm run typecheck` | 未执行（同上） |

## 7. 风险与未决

- 本基线只覆盖主要不变量，未逐条罗列字段级校验；字段级规则以 `form.validation.ts` 与 `form.schema.ts` 为准。
- `docs/test-matrix.md` 中的「提交窗口」描述已与实现对齐（`form.config.service.ts` 调用窗口校验）；若两者再次不一致，先以代码为准并更新矩阵。

## 8. 给下一次会话的提示

- 改状态流转：先看 §4.1 与 ADR-0002，再同步前端映射与测试矩阵。
- 改名额逻辑：先看 ADR-0005，所有占用/释放必须传事务连接。
- 改字段或表单结构：先看 ADR-0003，走新增迁移。
- 改认证/会话：先看 ADR-0004，注意 Cookie 路径与 CSRF 双提交。
