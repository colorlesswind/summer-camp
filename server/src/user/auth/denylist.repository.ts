import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../db/pool';

/**
 * access token 的 jti 黑名单。
 * 现在落在 MySQL；后续量级上来可以换成 Redis（同样实现下面三个方法即可）。
 */
export interface TokenRevocationStore {
  isRevoked(jti: string): Promise<boolean>;
  revoke(input: { jti: string; userId: string | null; reason: string; expiresAt: Date }): Promise<void>;
  purgeExpired(before: Date): Promise<number>;
}

export const jwtDenylistRepository: TokenRevocationStore = {
  async isRevoked(jti: string): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT 1 FROM jwt_denylist WHERE jti = ? LIMIT 1',
      [jti],
    );
    return rows.length > 0;
  },

  async revoke(input): Promise<void> {
    await pool.execute(
      `INSERT INTO jwt_denylist (jti, user_id, reason, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
      [input.jti, input.userId, input.reason, input.expiresAt, new Date()],
    );
  },

  async purgeExpired(before: Date): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>('DELETE FROM jwt_denylist WHERE expires_at < ?', [
      before,
    ]);
    return result.affectedRows;
  },
};
