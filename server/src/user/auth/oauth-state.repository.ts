import type { ResultSetHeader } from 'mysql2/promise';
import { pool } from '../../db/pool';
import type { OAuthStateRow } from '../user.types';

const STATE_COLUMNS =
  'state, provider, code_verifier, nonce, redirect_to, link_user_id, expires_at, created_at';

export interface CreateOAuthStateInput {
  state: string;
  provider: string;
  codeVerifier: string;
  nonce: string | null;
  redirectTo: string | null;
  linkUserId: string | null;
  expiresAt: Date;
}

export const oauthStateRepository = {
  async create(input: CreateOAuthStateInput): Promise<void> {
    await pool.execute(
      `INSERT INTO oauth_states
         (state, provider, code_verifier, nonce, redirect_to, link_user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.state,
        input.provider,
        input.codeVerifier,
        input.nonce,
        input.redirectTo,
        input.linkUserId,
        input.expiresAt,
        new Date(),
      ],
    );
  },

  /** 一次性的：取出即删除，重放同一个 state 会直接失败 */
  async consume(state: string): Promise<OAuthStateRow | null> {
    const [rows] = await pool.execute<OAuthStateRow[]>(
      `SELECT ${STATE_COLUMNS} FROM oauth_states WHERE state = ? LIMIT 1`,
      [state],
    );
    const row = rows[0];
    if (!row) return null;

    const [result] = await pool.execute<ResultSetHeader>('DELETE FROM oauth_states WHERE state = ?', [
      state,
    ]);
    return result.affectedRows === 1 ? row : null;
  },

  async purgeExpired(before: Date): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>('DELETE FROM oauth_states WHERE expires_at < ?', [
      before,
    ]);
    return result.affectedRows;
  },
};
