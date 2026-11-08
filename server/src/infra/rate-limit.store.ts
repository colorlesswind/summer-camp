import type { RowDataPacket } from 'mysql2/promise';
import { pool, withTransaction } from '../db/pool';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * 限流存储抽象。
 * 现在用 MySQL 实现（单实例够用，多实例也能共享计数）；
 * 后续切 Redis 时只需新增一个 RedisRateLimitStore 并替换实现，业务层零改动。
 */
export interface RateLimitStore {
  consume(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  clear(bucket: string): Promise<void>;
}

class MySqlRateLimitStore implements RateLimitStore {
  async consume(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    return withTransaction(async (conn) => {
      await conn.execute('DELETE FROM rate_limit_events WHERE bucket = ? AND created_at < ?', [
        bucket,
        windowStart,
      ]);
      await conn.execute('INSERT INTO rate_limit_events (bucket, created_at) VALUES (?, ?)', [
        bucket,
        now,
      ]);
      const [rows] = await conn.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM rate_limit_events WHERE bucket = ? AND created_at >= ?',
        [bucket, windowStart],
      );
      const count = Number(rows[0]?.['total'] ?? 0);

      if (count > limit) {
        // 超出配额时不落库，避免被刷爆的 bucket 无限膨胀
        await conn.rollback();
        const retryAfterSeconds = Math.max(1, Math.ceil(windowSeconds / 2));
        return { allowed: false, count, remaining: 0, retryAfterSeconds };
      }

      return {
        allowed: true,
        count,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: 0,
      };
    });
  }

  async clear(bucket: string): Promise<void> {
    await pool.execute('DELETE FROM rate_limit_events WHERE bucket = ?', [bucket]);
  }
}

let store: RateLimitStore = new MySqlRateLimitStore();

export const rateLimitStore = {
  consume: (bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult> =>
    store.consume(bucket, limit, windowSeconds),
  clear: (bucket: string): Promise<void> => store.clear(bucket),
  /** 预留：切换到 Redis/内存实现时调用 */
  replace(next: RateLimitStore): void {
    store = next;
  },
};
