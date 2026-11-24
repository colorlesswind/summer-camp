# ADR-0003：表单字段元数据驱动，提交窗口入库配置

- 状态：Accepted（2026-11-22 回溯补录，依据代码基线 `0a63c1e`）
- 涉及区域：`server/src/form/form.config.*`、`server/src/db/migrations/003`–`004`

## 背景

申请表分多个小节，字段、必填性、选项、最大长度可能在报名周期之间调整；
提交时间窗口也需要按批次变更，而不是写死在代码里。

## 选项

| 选项 | 代价 |
| --- | --- |
| A 字段与校验全部硬编码 | 每次调整都要发版，前后端同时改 |
| B 字段元数据入库，代码只做通用渲染与校验 | 需要迁移与配置数据维护 |
| C 外部配置中心 | 引入额外部署依赖，超出当前规模 |

## 决策

采用 B：

- 小节/字段/选项存 `form_sections`、`form_fields`、`form_field_options`，落库映射由配置驱动；
- 提交窗口存 `submission_windows`，由 `form.config.service.ts` 在提交前校验；
- 只有首次 `submit` 受窗口约束，`resubmit` 不受限。

## 理由

- 新增字段不改代码，降低前后端联调成本。
- 窗口是运营数据，入库后可按批次调整且留痕。
- 配置与校验共用同一份元数据，避免前后端规则分叉。

## 后果

- 新增/修改字段必须走新增迁移，并同步前端展示与提交校验用例。
- 关闭第一志愿必填时，名额不占用（`applyQuota` 中显式处理），这是配置与名额的耦合点，改动需谨慎。
- 元数据变更属于业务规则变更，必须更新 `docs/invariants.md` 条目并在 PR 描述中说明；影响跨端契约时补 ADR。

## 回滚

若放弃元数据驱动：先把现有配置导出为代码常量并保持同一编译产物接口，
再移除读取路径；期间不得同时存在两套字段定义。

## 证据

| 位置 | 说明 |
| --- | --- |
| `server/src/db/migrations/003_application_schema.sql` | `form_sections`、`form_fields`、`form_field_options`、`submission_windows` |
| `server/src/db/migrations/004_application_reference_data.sql` | 字段与窗口种子数据 |
| `server/src/form/form.config.repository.ts` / `form.config.service.ts` | 读取配置、编译表单、提交窗口校验（`assertSubmissionWindowOpen`） |
| `server/src/form/application.state.ts` | 窗口纯函数：只对 `submit` 要求窗口，`resubmit` 不受限 |
| `server/src/form/form.validation.ts` / `form.schema.ts` | 基于元数据的通用校验 |
