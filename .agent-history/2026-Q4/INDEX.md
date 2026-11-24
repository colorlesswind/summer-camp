# Agent 会话历史索引（2026-Q4，已冻结）

> **本索引属于只读归档，2026-11-24 起不再追加。** 现行约束见 [docs/invariants.md](../../docs/invariants.md)，
> 决策见 [docs/decisions/README.md](../../docs/decisions/README.md)，变更事实见 PR 描述与 [CHANGELOG.md](../../CHANGELOG.md)。
> 归档说明见 [ARCHIVE.md](../ARCHIVE.md)。
> 检索：`rg -n "<关键词>" .agent-history docs/decisions`。
> 原始规则来源：[AGENTS.md](../../AGENTS.md) §2 / §6（已改版，仅作历史背景）。最后更新：2026-11-24。

| 日期 | 标识 | 记录 | 影响区域 | 关键不变量 / 决策 | ADR | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-22 | baseline-invariants | [2026-11-22-baseline-invariants.md](./2026-11-22-baseline-invariants.md) | server/form, server/user, server/db, ui | 补录现有基线：9 状态 × 10 动作、名额原子占用、Cookie + CSRF、表单元数据驱动、迁移只增不改 | ADR-0001 ~ ADR-0005 | done |
| 2026-11-22 | agent-memory-system | [2026-11-22-agent-memory-system.md](./2026-11-22-agent-memory-system.md) | AGENTS.md, .agent-history, docs/decisions, .github/agents | 建立检索-记录机制；运行时行为无变化 | ADR-0001 ~ ADR-0005（回溯） | done |
| 2026-11-24 | adr-readme-rule | [2026-11-24-adr-readme-rule.md](./2026-11-24-adr-readme-rule.md) | AGENTS.md §4/§6/§7 | 新增/修改 ADR 前必须先读 docs/decisions/README.md 并按规则落笔；并入既有 section，未新增章节；运行时行为无变化 | — | done |
