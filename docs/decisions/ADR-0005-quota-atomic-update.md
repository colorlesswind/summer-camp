# ADR-0005：名额占用用条件原子更新，禁止先查后改

- 状态：Accepted（2026-11-22 回溯补录，依据代码基线 `0a63c1e`）
- 涉及区域：`server/src/form/form.quota.ts`、`server/src/form/form.service.ts`、`server/src/db/migrations/006_supervisor_quota.sql`

## 背景

每位导师有容量上限，提交时占用名额。并发提交、退回后重提换导师、拒绝/放弃时释放，
都可能出现超卖或少释放。

## 选项

| 选项 | 代价 |
| --- | --- |
| A 先 `SELECT` 判断余量再 `UPDATE` | 两步之间可被并发插入，必然超卖 |
| B 条件原子更新 `UPDATE ... WHERE quota_used < quota_capacity` | 需要统一入口与事务连接约束 |
| C 应用层分布式锁 | 引入外部依赖，故障面变大 |

## 决策

采用 B：

- 唯一写入口 `supervisorQuota`（`acquire` / `release` / `transfer`），全部要求传入调用方事务连接；
- 影响行数为 0 时再查一次仅为区分「名额满」与「导师不存在」，判定本身已由原子更新完成；
- `supervisors.chk_supervisors_quota` 作为最后兜底；
- 锁顺序固定：先 `applications` 后 `supervisors`；换导师按 supervisor id 升序，避免交叉等待；
- `applications.quota_supervisor_id` 记录当前占位导师，不能复用 `reviewer_supervisor_id`。

## 理由

- InnoDB 在最新已提交版本上重判 `WHERE`，天然串行化竞争写入。
- 精确记录占位导师才能在换导师与释放时正确回退。
- 与状态事务同连接，保证「改状态」和「改名额」同成同败。

## 后果

- 任何新增的占用/释放入口必须复用 `supervisorQuota`，禁止自写 SQL。
- 不允许在 `acquire` 之外做「先查余量」的业务判断。
- 名额与状态的对应关系：`submit` 占用，`resubmit` 迁移，`reject` / `decline_offer` 释放，
  `Returned` 期间继续占位，`accept_offer` 后为最终占用。
- 迁移脚本改动需验证存量数据回填与 `CHECK` 约束。

## 回滚

不可降级为两步更新。若必须改变并发模型，先保留原子更新作为兜底，
再评估是否引入队列串行化；切换期间不得存在两条写入路径。

## 证据

| 位置 | 说明 |
| --- | --- |
| `server/src/form/form.quota.ts` | 文件头并发说明；`acquire` 条件更新；`release`、`transfer` 的锁顺序 |
| `server/src/form/form.service.ts` | `applyQuota` 按动作决定占用/迁移/释放；与状态流转同一事务 |
| `server/src/db/migrations/006_supervisor_quota.sql` | `quota_supervisor_id`、外键索引、`CHECK` 兜底、存量回填口径 |
| `server/src/db/migrations/003_application_schema.sql` | `supervisors` 的容量字段 |
