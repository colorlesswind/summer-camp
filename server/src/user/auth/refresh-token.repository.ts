import type { ResultSetHeader } from 'mysql2/promise';
import { pool } from '../../db/pool';
import type { RefreshTokenRow } from '../user.types';

const REFRESH_COLUMNS =
  'jti, user_id, family_id, parent_jti, token_hash, amr, user_agent, ip, expires_at, revoked_at, revoke_reason, created_at';

export interface CreateRefreshTokenInput {
  jti: string;
  userId: string;
  familyId: string;
  parentJti: string | null;
  tokenHash: string;
  amr: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
}

export const refreshTokenRepository = {
  async create(input: CreateRefreshTokenInput): Promise<void> {
    await pool.execute(
      `INSERT INTO refresh_tokens
         (jti, user_id, family_id, parent_jti, token_hash, amr, user_agent, ip, expires_at, revoked_at, revoke_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      [
        input.jti,
        input.userId,
        input.familyId,
        input.parentJti,
        input.tokenHash,
        input.amr,
        input.userAgent,
        input.ip,
        input.expiresAt,
        new Date(),
      ],
    );
  },

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const [rows] = await pool.execute<RefreshTokenRow[]>(
      `SELECT ${REFRESH_COLUMNS} FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  },

  /** 旋转：只有当前 jti 仍未被吊销时才能成功，天然抵御并发重放 */
  async markRotated(jti: string, at: Date): Promise<boolean> {
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE refresh_tokens SET revoked_at = ?, revoke_reason = ? WHERE jti = ? AND revoked_at IS NULL',
      [at, 'rotated', jti],
    );
    return result.affectedRows === 1;
  },

  async revoke(jti: string, reason: string, at: Date): Promise<void> {
    await pool.execute(
      'UPDATE refresh_tokens SET revoked_at = ?, revoke_reason = ? WHERE jti = ? AND revoked_at IS NULL',
      [at, reason, jti],
    );
  },

  /** 吊销整个 family —— 检测到 refresh token 复用时调用 */
  async revokeFamily(familyId: string, reason: string, at: Date): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE refresh_tokens SET revoked_at = ?, revoke_reason = ? WHERE family_id = ? AND revoked_at IS NULL',
      [at, reason, familyId],
    );
    return result.affectedRows;
  },

  async revokeAllForUser(userId: string, reason: string, at: Date, exceptFamilyId?: string): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE refresh_tokens SET revoked_at = ?, revoke_reason = ?
       WHERE user_id = ? AND revoked_at IS NULL AND (? IS NULL OR family_id <> ?)`,
      [at, reason, userId, exceptFamilyId ?? null, exceptFamilyId ?? null],
    );
    return result.affectedRows;
  },

  async purgeExpired(before: Date): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM refresh_tokens WHERE expires_at < ?',
      [before],
    );
    return result.affectedRows;
  },
};
