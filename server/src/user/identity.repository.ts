import { pool } from '../db/pool';
import { isDuplicateEntry } from '../db/mysql-errors';
import { newId, normalizeEmail } from '../common/crypto';
import { conflict } from '../common/errors';
import type { IdentityRow } from './user.types';

const IDENTITY_COLUMNS =
  'id, user_id, provider, provider_user_id, email_at_provider, profile_json, created_at, updated_at';

export interface CreateIdentityInput {
  userId: string;
  provider: string;
  providerUserId: string;
  email?: string | null;
  profile?: unknown;
}

export const identitiesRepository = {
  async findByProvider(provider: string, providerUserId: string): Promise<IdentityRow | null> {
    const [rows] = await pool.execute<IdentityRow[]>(
      `SELECT ${IDENTITY_COLUMNS} FROM identities WHERE provider = ? AND provider_user_id = ? LIMIT 1`,
      [provider, providerUserId],
    );
    return rows[0] ?? null;
  },

  async listByUser(userId: string): Promise<IdentityRow[]> {
    const [rows] = await pool.execute<IdentityRow[]>(
      `SELECT ${IDENTITY_COLUMNS} FROM identities WHERE user_id = ? ORDER BY created_at ASC`,
      [userId],
    );
    return rows;
  },

  async create(input: CreateIdentityInput): Promise<IdentityRow> {
    const id = newId();
    const now = new Date();
    try {
      await pool.execute(
        `INSERT INTO identities (id, user_id, provider, provider_user_id, email_at_provider, profile_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.userId,
          input.provider,
          input.providerUserId,
          input.email ? normalizeEmail(input.email) : null,
          input.profile === undefined ? null : JSON.stringify(input.profile),
          now,
          now,
        ],
      );
    } catch (error) {
      if (isDuplicateEntry(error)) {
        throw conflict('该第三方账号已被绑定', { code: 'identity_taken' });
      }
      throw error;
    }

    const [rows] = await pool.execute<IdentityRow[]>(
      `SELECT ${IDENTITY_COLUMNS} FROM identities WHERE id = ? LIMIT 1`,
      [id],
    );
    const created = rows[0];
    if (!created) throw new Error('identity create failed');
    return created;
  },

  async remove(userId: string, provider: string): Promise<boolean> {
    const [result] = await pool.execute<import('mysql2/promise').ResultSetHeader>(
      'DELETE FROM identities WHERE user_id = ? AND provider = ?',
      [userId, provider],
    );
    return result.affectedRows > 0;
  },
};
