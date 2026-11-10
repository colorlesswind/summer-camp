import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AppError, conflict } from '../common/errors';

interface QuotaStateRow extends RowDataPacket {
  name: string;
  quota_capacity: number;
  quota_used: number;
}

/**
 * 报名名额（需求 2.1）的唯一写入口。
 *
 * 并发模型：所有占用/释放都必须传调用方的事务连接，并且用「条件原子更新」
 * 完成判定，不能先 SELECT 再 UPDATE（两步之间会被其他事务插队）：
 *
 *   UPDATE supervisors SET quota_used = quota_used + 1
 *    WHERE id = ? AND quota_used < quota_capacity
 *
 * InnoDB 会先对该主键行加排他锁，再在最新已提交版本上重新判断 WHERE，
 * 因此 N 个并发事务里只有 (capacity - used) 个能拿到 affectedRows = 1，
 * 其余拿到 0 并得到 409 quota_full。supervisors 上的 CHECK 约束兜底。
 *
 * 锁顺序：调用方的 transition 先锁 applications 行，再锁 supervisors 行；
 * 换导师时按 supervisor id 升序操作（见 transfer），避免 A→B 与 B→A
 * 并发时互相等待。
 */
export const supervisorQuota = {
  /** 占用 1 个名额；名额已满抛 409 quota_full，导师不存在抛 400 invalid_option */
  async acquire(conn: PoolConnection, supervisorId: number, now: Date): Promise<void> {
    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE supervisors
          SET quota_used = quota_used + 1,
              updated_at = ?
        WHERE id = ?
          AND quota_used < quota_capacity`,
      [now, supervisorId],
    );

    if (result.affectedRows > 0) return;

    // 影响行数为 0：要么名额满，要么导师不存在。补一次查询只为把原因说清楚，
    // 判定本身已经由上面的原子更新完成，这次查询不参与并发控制。
    const [rows] = await conn.execute<QuotaStateRow[]>(
      'SELECT name, quota_capacity, quota_used FROM supervisors WHERE id = ? LIMIT 1',
      [supervisorId],
    );
    const state = rows[0];
    if (!state) {
      throw new AppError(400, 'invalid_option', '第一志愿导师不存在', {
        code: 'invalid_option',
        supervisorId,
      });
    }

    throw conflict(
      `第一志愿导师 ${state.name} 的报名名额已满（${state.quota_used}/${state.quota_capacity}）`,
      {
        code: 'quota_full',
        supervisorId,
        supervisorName: state.name,
        capacity: Number(state.quota_capacity),
        used: Number(state.quota_used),
      },
    );
  },

  /**
   * 释放 1 个名额。
   * quota_used > 0 作为幂等保护：重复释放最多把计数停在 0，不会出现负数
   * （负数也会被 chk_supervisors_quota 拒绝）。
   */
  async release(conn: PoolConnection, supervisorId: number, now: Date): Promise<void> {
    await conn.execute(
      `UPDATE supervisors
          SET quota_used = quota_used - 1,
              updated_at = ?
        WHERE id = ?
          AND quota_used > 0`,
      [now, supervisorId],
    );
  },

  /**
   * 把「这份申请占用的名额」从 fromId 迁到 toId（同一个事务内）：
   *   - from === to：直接返回，Resubmit 未换导师不重复占用
   *   - from 为空：只占用 to
   *   - to 为空：只释放 from
   *   - 都非空：按 id 升序加锁后释放 + 占用；占用失败会抛错，
   *     由调用方事务回滚，from 的释放自动撤销
   */
  async transfer(
    conn: PoolConnection,
    fromId: number | null,
    toId: number | null,
    now: Date,
  ): Promise<void> {
    if (fromId === toId) return;

    if (fromId === null) {
      if (toId !== null) await this.acquire(conn, toId, now);
      return;
    }

    if (toId === null) {
      await this.release(conn, fromId, now);
      return;
    }

    // 统一按 id 升序加锁：并发互换（A→B 与 B→A）不会形成环
    if (toId < fromId) {
      await this.acquire(conn, toId, now);
      await this.release(conn, fromId, now);
    } else {
      await this.release(conn, fromId, now);
      await this.acquire(conn, toId, now);
    }
  },
};
