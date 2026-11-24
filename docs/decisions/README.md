# 决策记录（ADR）

> 只把状态为 `Accepted` 的 ADR 当作现行约束。检索规则见 [AGENTS.md](../../AGENTS.md) §2。
> 每条 ADR 对应的一句话现行规则登记在 [docs/invariants.md](../invariants.md)；检索时先按 INV 编号定位，再回到本目录读决策背景。
> 模板沿用 [.github/agents/architecture.agent.md](../../.github/agents/architecture.agent.md) §9.1：状态 / 背景 / 选项 / 决策 / 理由 / 后果 / 回滚。
> 本目录的 ADR-0001 ~ ADR-0005 为 2026-11-22 依据代码基线 `0a63c1e` 回溯补录，用于给后续会话提供可检索的现行约束。

## 状态定义

| 状态 | 含义 | 是否构成约束 |
| --- | --- | --- |
| Proposed | 提议中，尚未生效 | 否 |
| Accepted | 当前生效 | **是** |
| Superseded | 已被新 ADR 取代 | 否（仅背景，需看新 ADR） |
| Deprecated | 已废弃 | 否 |

## 命名与编号

- 文件名：`ADR-<四位编号>-<kebab-slug>.md`。
- 编号单调递增、不复用；替代关系在双方文件里互相引用（`Supersedes` / `Superseded by`）。
- 修改已 Accepted 的决策 = 新建 ADR + 旧 ADR 标 `Superseded`，禁止直接改写结论。

## 索引

| 编号 | 标题 | 状态 | 日期 | 涉及区域 |
| --- | --- | --- | --- | --- |
| [ADR-0001](./ADR-0001-modular-monolith.md) | 模块化单体，按业务域分目录 | Accepted | 2026-11-22 | `server/src/**` |
| [ADR-0002](./ADR-0002-state-machine-in-code.md) | 状态机与动作权限矩阵写在代码里 | Accepted | 2026-11-22 | `server/src/form`、`server/src/user`、`ui/src/constants` |
| [ADR-0003](./ADR-0003-metadata-driven-form.md) | 表单字段元数据驱动，提交窗口入库配置 | Accepted | 2026-11-22 | `server/src/form`、`db/migrations` |
| [ADR-0004](./ADR-0004-cookie-csrf-auth.md) | 认证用 HttpOnly Cookie + CSRF 双提交，一人一角色 | Accepted | 2026-11-22 | `server/src/user`、`server/src/middleware` |
| [ADR-0005](./ADR-0005-quota-atomic-update.md) | 名额占用用条件原子更新，禁止先查后改 | Accepted | 2026-11-22 | `server/src/form/form.quota.ts`、`db/migrations/006` |
