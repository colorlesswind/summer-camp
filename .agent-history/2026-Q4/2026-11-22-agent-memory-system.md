# 2026-11-22 · agent-memory-system

- 日期：2026-11-22
- 触发需求：新增 `AGENTS.md` 规则、`.agent-history/` 会话索引与 `docs/decisions/` ADR，防止后续 agent 在实现新功能时破坏已有业务逻辑。
- 涉及角色：通用 agent（文档与流程；无运行时改动）
- 关联 ADR：ADR-0001 ~ ADR-0005（新增，回溯补录）
- 关联历史：[2026-11-22-baseline-invariants.md](./2026-11-22-baseline-invariants.md)

## 1. 目标与非目标

- 目标：建立「改业务逻辑前先查历史 + 收工写记录」的可执行机制，并给现有业务补一份基线。
- 非目标：不改任何运行时行为；不重写历史会话；不引入 CI 门禁（用户选择暂不启用）。

## 2. 检索结论

- 读过的历史记录：无（本次建立机制，仓库此前没有 `.agent-history/`）
- 读过的 ADR：无（同期补录）
- 关键词：`ADR`、`agent-history`、`AGENTS.md`、`copilot-instructions`
- 是否冲突：否
- 未命中历史时依据：`README.md`、`docs/test-matrix.md`、`server/src/form/application.state.ts`、`form.quota.ts`、`form.service.ts`、`form.display.ts`、`user/auth/cookies.ts`、`middleware/csrf.ts`、`db/migrations/003`–`006`

## 3. 改动清单

| 文件 | 改动摘要 |
| --- | --- |
| `AGENTS.md` | 新增：强制检索规则、业务边界地图、改动约束、验证要求、收工清单 |
| `.agent-history/INDEX.md` | 新增：追加式会话索引 |
| `.agent-history/_TEMPLATE.md` | 新增：session 记录模板（含不变量前后对比） |
| `.agent-history/2026-11-22-baseline-invariants.md` | 新增：现有业务不变量基线（回溯） |
| `docs/decisions/README.md` | 新增：ADR 状态定义、命名规则与索引 |
| `docs/decisions/ADR-0001` ~ `ADR-0005` | 新增：模块化单体、状态机在代码、元数据表单、Cookie+CSRF、名额原子更新 |
| `.github/agents/*.agent.md`（6 份） | 各加一行指针，指向 `AGENTS.md` §2 / §6 |

## 4. 业务不变量（前后对比）

| 规则 | 改动前 | 改动后 | 兜底层级（DB / 服务 / UI） |
| --- | --- | --- | --- |
| 运行时业务规则、状态机、名额、认证 | 既有实现 | 未改动 | — |
| Agent 改动前检索历史 | 无约定 | 强制：先读 INDEX + 检索 ADR，冲突即停 | 流程约定（非运行时） |
| Agent 收工记录 | 无约定 | 必须以模板写 session 并追加 INDEX | 流程约定（非运行时） |

## 5. 兼容性与迁移

- 接口 / 字段 / 错误码：无变化。
- 迁移脚本：无。
- 回滚方式：删除 `AGENTS.md`、`.agent-history/`、`docs/decisions/`，并还原 6 份 agent 文件即可。

## 6. 验证

| 命令 | 结果 |
| --- | --- |
| 相对链接检查（16 个 md、26 条链接） | 全部可解析 |
| `INDEX.md` 行数 vs session 文件数 | 1 : 1（追加本记录后为 2 : 2） |
| `cd server; npm test` / `cd ui; npm test` | 未执行：本次无源码改动 |

## 7. 风险与未决

- 机制依赖 agent 自觉，没有 CI 强制；若发现漏记，可后续加 diff 校验脚本。
- `README.md` 的 agent 文档链接仍指向失效的 `docs/<role>-agent.md`；本次按用户要求未改动 README。
- `2026-11-22-baseline-invariants.md` 是回溯补录，不是实时记录；字段级规则仍需以 `form.validation.ts` / `form.schema.ts` 为准。

## 8. 给下一次会话的提示

- 先读 [`INDEX.md`](./INDEX.md) 和基线记录，再动 `server/src/form/**`。
- 改状态机、名额、认证、表单字段时，对应 ADR-0002 / 0005 / 0004 / 0003 是现行约束。
- 收工时别忘了把本文件复制成新记录、并在 INDEX 末尾追加一行。
