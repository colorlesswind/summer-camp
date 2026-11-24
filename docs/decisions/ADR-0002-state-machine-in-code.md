# ADR-0002：状态机与动作权限矩阵写在代码里

- 状态：Accepted（2026-11-22 回溯补录，依据代码基线 `0a63c1e`）
- 涉及区域：`server/src/form/application.state.ts`、`server/src/form/form.service.ts`、`server/src/user/user.types.ts`、`server/src/middleware/authorize.ts`、`ui/src/constants/application.ts`

## 背景

申请单有 9 个状态、10 个动作、3 种角色。规则同时约束「谁能做」「从什么状态能做」「做到什么状态」，
并且必须与名额、审计日志在同一事务内生效。

## 选项

| 选项 | 代价 |
| --- | --- |
| A 规则常量化在代码里，随发布生效 | 运营规则调整需发版 |
| B role / permission / transition 表化 | 规则与代码易不同步；测试需覆盖数据组合 |
| C 配置文件驱动 | 与 B 类似，且类型安全弱 |

## 决策

采用 A：状态枚举、动作枚举、`TRANSITIONS` 矩阵与断言函数集中在 `application.state.ts`；
路由层用 `requireRole` 做粗筛，服务层用 `assertCan` 做真正的状态与角色校验，两层都不可省。

## 理由

- 规则是业务不变量，不是运营数据；发版节奏可接受。
- 代码可获得编译期与单测覆盖，避免「库里少一行导致越权」。
- 单一事实来源：前端只做展示映射，不自行推导合法流转。

## 后果

- 改动状态机必须同时更新：`TRANSITIONS`、`form.service.ts` 流转事务、前端状态映射、测试矩阵，并新增 ADR。
- 新增动作必须补「角色 × 起始状态」用例，否则视为未完成。
- 前端按钮显隐可以复用纯函数 `canPerform`，但不得作为唯一校验。

## 回滚

若未来需要运营在线调整流转：先把 `TRANSITIONS` 抽成可加载的数据结构并保留同样签名，
再用配置源替换常量；在切换前必须补齐矩阵测试，禁止直接改表绕过服务层。

## 证据

| 位置 | 说明 |
| --- | --- |
| `server/src/form/application.state.ts` | 文件头注释声明「规则写在代码、不做表化」；`TRANSITIONS`、`canPerform`、`assertCan`、`assertOwnership` |
| `server/src/form/form.service.ts` | 流转事务先 `assertCan`，再校验、改状态、写审计 |
| `server/src/user/user.types.ts` | `USER_ROLES`；角色每次请求从 `users.role` 实时读取，不放进 token |
| `server/src/middleware/authorize.ts` | `requireRole` 路由级粗筛 |
| `ui/src/constants/application.ts` | 前端仅维护展示元数据，并注明以服务端 `displayStatus` 为准 |
