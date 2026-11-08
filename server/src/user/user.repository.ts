import type { ResultSetHeader } from 'mysql2/promise';
import { pool, withTransaction } from '../db/pool';
import { isDuplicateEntry } from '../db/mysql-errors';
import { newId, normalizeEmail } from '../common/crypto';
import { conflict, internal } from '../common/errors';
import type { UserRow } from './user.types';

const USER_COLUMNS =
  'id, primary_email, display_name, email_verified_at, status, created_at, updated_at';

export interface CreateUserInput {
  email: string;
  passwordHash?: string;
  displayName?: string | null;
  emailVerifiedAt?: Date | null;
}

export const usersRepository = {
  async findByEmail(email: string): Promise<UserRow | null> {
    const [rows] = await pool.execute<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM users WHERE primary_email = ? LIMIT 1`,
      [normalizeEmail(email)],
    );
    return rows[0] ?? null;
  },

  async findById(id: string): Promise<UserRow | null> {
    const [rows] = await pool.execute<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateUserInput): Promise<UserRow> {
    const email = normalizeEmail(input.email);
    const id = newId();
    const now = new Date();

    try {
      await withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO users (id, primary_email, display_name, email_verified_at, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?)`,
          [id, email, input.displayName ?? null, input.emailVerifiedAt ?? null, now, now],
        );
        if (input.passwordHash) {
          await conn.execute(
            `INSERT INTO password_credentials (user_id, password_hash, algo, updated_at)
             VALUES (?, ?, 'bcrypt', ?)`,
            [id, input.passwordHash, now],
          );
        }
      });
    } catch (error) {
      if (isDuplicateEntry(error)) {
        throw conflict('该邮箱已被注册', { code: 'email_taken' });
      }
      throw error;
    }

    const created = await usersRepository.findById(id);
    if (!created) throw internal('用户创建后读取失败');
    return created;
  },

  async markEmailVerified(userId: string, at: Date): Promise<void> {
    await pool.execute(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?',
      [at, at, userId],
    );
  },

  async touch(userId: string): Promise<void> {
    await pool.execute('UPDATE users SET updated_at = ? WHERE id = ?', [new Date(), userId]);
  },
};

export const passwordRepository = {
  async getHash(userId: string): Promise<string | null> {
    const [rows] = await pool.execute<Array<{ password_hash: string } & import('mysql2/promise').RowDataPacket>>(
      'SELECT password_hash FROM password_credentials WHERE user_id = ? LIMIT 1',
      [userId],
    );
    return rows[0]?.password_hash ?? null;
  },

  async upsert(userId: string, passwordHash: string): Promise<void> {
    await pool.execute(
      `INSERT INTO password_credentials (user_id, password_hash, algo, updated_at)
       VALUES (?, ?, 'bcrypt', ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), algo = 'bcrypt', updated_at = VALUES(updated_at)`,
      [userId, passwordHash, new Date()],
    );
  },

  async remove(userId: string): Promise<void> {
    await pool.execute<ResultSetHeader>('DELETE FROM password_credentials WHERE user_id = ?', [userId]);
  },
};
