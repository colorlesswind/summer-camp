# 2026-11-24 · adr-readme-rule

- 日期：2026-11-24
- 触发需求：在 `AGENTS.md` 中规定新增或修改 ADR 前必须先参考 `docs/decisions/README.md` 的规则，并要求并入既有 section 而非新增章节。
- 涉及角色：通用 agent（文档与流程）
- 关联 ADR：无新增、无取代；ADR-0001 ~ ADR-0005 结论不变
- 关联历史：[2026-11-22-agent-memory-system.md](./2026-11-22-agent-memory-system.md)

## 1. 目标与非目标

- 目标：把「ADR 写作规范出处」这一隐性依赖显式化，写进已有的 §4 / §6 / §7。
- 非目标：不新增 section；不改 `docs/decisions/README.md` 与任何 ADR 正文；无运行时改动；不动 §2 的检索执行顺序。

## 2. 检索结论

- 读过的历史记录：[INDEX.md](./INDEX.md) 全表、[2026-11-22-agent-memory-system.md](./2026-11-22-agent-memory-system.md)
- 读过的 ADR：[docs/decisions/README.md](../../docs/decisions/README.md) 索引表 5 条，状态均为 Accepted（未逐条打开正文：本次不触达其结论）
- 关键词：`ADR`、`decisions`、`Superseded`、`INDEX`
- 是否冲突：否
- 未命中历史时，据以判断的代码位置：`AGENTS.md` §4 / §6 / §7 原文；`docs/decisions/README.md` 的命名、状态与变更规则

## 3. 改动清单

| 文件 | 改动摘要 |
| --- | --- |
| `AGENTS.md` §4 | 「状态机变更」「契约变更」两条补入「按 `docs/decisions/README.md` 的规则」 |
| `AGENTS.md` §6.3 | 补「先读 README 规则（编号、状态、七段结构、Superseded 回链、禁止改写 Accepted 结论）再落笔」，跳过即视为未完成 |
| `AGENTS.md` §7 | 「不要静默修改 Accepted ADR」一条补规则出处 |

## 4. 业务不变量（前后对比）

| 规则 | 改动前 | 改动后 | 兜底层级（DB / 服务 / UI） |
| --- | --- | --- | --- |
| Agent 新增/修改 ADR 前的动作 | 仅要求「新增 ADR」「标 Superseded 并双向回链」，规则出处需自行推断 | 必须先读 `docs/decisions/README.md` 并按规则执行，否则视为未完成 | 流程约定（非运行时） |
| 运行时业务规则、状态机、名额、认证 | 未改动 | 未改动 | — |

## 5. 兼容性与迁移

- 接口 / 字段 / 错误码：无变化。
- 迁移脚本：无。
- 回滚方式：还原 `AGENTS.md` 这四处的措辞即可。

## 6. 验证

| 命令 | 结果 |
| --- | --- |
| 相对链接 `./docs/decisions/README.md` 可解析 | 通过（文件存在，4 处引用同一路径） |
| `cd server; npm test` / `cd ui; npm test` | 未执行：本次仅文档，按 §5「仅文档」口径无需构建 |

## 7. 风险与未决

- 规则仍依赖 agent 自觉，无 CI 校验。
- §2 第 1 步（`AGENTS.md:27`）仍只点名 `.agent-history/INDEX.md`；是否把 ADR 索引一并纳入检索顺序，本次按用户要求未改。

## 8. 给下一次会话的提示

- 写 ADR 前先读 [docs/decisions/README.md](../../docs/decisions/README.md)，下一个编号从索引表末行 +1。
- 只是新增功能、不触达契约/不变量时不要建 ADR。
