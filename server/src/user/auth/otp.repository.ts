import type { ResultSetHeader } from 'mysql2/promise';
import { pool } from '../../db/pool';
import { newId, normalizeEmail } from '../../common/crypto';
import type { OtpChallengeRow, OtpPurpose } from '../user.types';

const OTP_COLUMNS =
  'id, email, user_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, request_ip, created_at';

export interface CreateOtpInput {
  email: string;
  userId: string | null;
  purpose: OtpPurpose;
  codeHash: string;
  maxAttempts: number;
  expiresAt: Date;
  requestIp: string | null;
}

export const otpRepository = {
  async findLatestActive(email: string, purpose: OtpPurpose): Promise<OtpChallengeRow | null> {
    const [rows] = await pool.execute<OtpChallengeRow[]>(
      `SELECT ${OTP_COLUMNS} FROM otp_challenges
       WHERE email = ? AND purpose = ? AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [normalizeEmail(email), purpose],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateOtpInput): Promise<OtpChallengeRow> {
    const id = newId();
    const now = new Date();
    await pool.execute(
      `INSERT INTO otp_challenges
         (id, email, user_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, request_ip, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL, ?, ?)`,
      [
        id,
        normalizeEmail(input.email),
        input.userId,
        input.purpose,
        input.codeHash,
        input.maxAttempts,
        input.expiresAt,
        input.requestIp,
        now,
      ],
    );

    const [rows] = await pool.execute<OtpChallengeRow[]>(
      `SELECT ${OTP_COLUMNS} FROM otp_challenges WHERE id = ? LIMIT 1`,
      [id],
    );
    const created = rows[0];
    if (!created) throw new Error('otp create failed');
    return created;
  },

  /** 先计数再比对，杜绝「无限次尝试」 */
  async incrementAttempts(id: string): Promise<number> {
    await pool.execute('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?', [id]);
    const [rows] = await pool.execute<Array<{ attempts: number } & import('mysql2/promise').RowDataPacket>>(
      'SELECT attempts FROM otp_challenges WHERE id = ? LIMIT 1',
      [id],
    );
    return Number(rows[0]?.attempts ?? 0);
  },

  /** 原子消费：只有把 consumed_at 从 NULL 改成功的那个请求才算验证通过 */
  async consume(id: string, at: Date): Promise<boolean> {
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL',
      [at, id],
    );
    return result.affectedRows === 1;
  },

  async invalidateActive(email: string, purpose: OtpPurpose, at: Date): Promise<void> {
    await pool.execute(
      'UPDATE otp_challenges SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL',
      [at, normalizeEmail(email), purpose],
    );
  },

  async purgeExpired(before: Date): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM otp_challenges WHERE expires_at < ?',
      [before],
    );
    return result.affectedRows;
  },
};
