import { pool } from '../db/pool';
import type { SupervisorRow } from './form.types';

/** 关键词里的 % 和 _ 需要转义，否则用户输入会被当成通配符 */
const escapeLike = (keyword: string): string => keyword.replace(/[\\%_]/g, (char) => `\\${char}`);

type SqlParam = string | number | boolean | Date | null;

export type BindOutcome = 'bound' | 'already_bound' | 'not_found' | 'conflict';

/**
 * 导师档案仓储。
 * 关键点：导师账号（users.role='supervisor'）与导师档案（supervisors）是两张表，
 * 靠 supervisors.user_id 关联。没绑定就查不到「分配给我的申请」。
 */
export const supervisorRepository = {
  async findByUserId(userId: string): Promise<SupervisorRow | null> {
    const [rows] = await pool.execute<SupervisorRow[]>(
      `SELECT id, user_emp_id, name, name_zh, email, thrust_code, dept_name_en, is_active
         FROM supervisors
        WHERE user_id = ?
        LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  },

  async searchByProgram(programCode: string, keyword: string | undefined, limit: number): Promise<SupervisorRow[]> {
    const params: SqlParam[] = [programCode];
    let sql = `SELECT id, user_emp_id, name, name_zh, email, thrust_code, dept_name_en, is_active
                 FROM supervisors
                WHERE is_active = TRUE AND thrust_code = ?`;
    if (keyword && keyword.trim().length > 0) {
      const like = `%${escapeLike(keyword.trim())}%`;
      sql += ' AND (name LIKE ? OR name_zh LIKE ? OR user_emp_id LIKE ?)';
      params.push(like, like, like);
    }
    sql += ' ORDER BY name LIMIT ?';
    params.push(limit);

    const [rows] = await pool.execute<SupervisorRow[]>(sql, params);
    return rows;
  },

  /** 校验「导师必须属于所选 Program」，返回 id → thrust_code */
  async findThrustByIds(ids: readonly number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map();
    const unique = [...new Set(ids)];
    const placeholders = unique.map(() => '?').join(', ');
    const [rows] = await pool.execute<Array<{ id: number; thrust_code: string } & import('mysql2/promise').RowDataPacket>>(
      `SELECT id, thrust_code FROM supervisors WHERE id IN (${placeholders})`,
      [...unique],
    );
    return new Map(rows.map((row) => [Number(row.id), row.thrust_code]));
  },

  /**
   * 按邮箱把登录账号绑定到导师档案（bootstrap 用，幂等）。
   * 只绑定尚未绑定的记录，绝不抢占别人的账号。
   */
  async bindUserByEmail(userId: string, email: string): Promise<BindOutcome> {
    const [rows] = await pool.execute<Array<{ id: number; user_id: string | null } & import('mysql2/promise').RowDataPacket>>(
      'SELECT id, user_id FROM supervisors WHERE email = ? LIMIT 1',
      [email.toLowerCase()],
    );
    const row = rows[0];
    if (!row) return 'not_found';
    if (row.user_id === userId) return 'already_bound';
    if (row.user_id !== null) return 'conflict';

    await pool.execute('UPDATE supervisors SET user_id = ?, updated_at = ? WHERE id = ? AND user_id IS NULL', [
      userId,
      new Date(),
      row.id,
    ]);
    return 'bound';
  },
};
