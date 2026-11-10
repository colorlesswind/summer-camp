import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { newId } from '../common/crypto';
import { internal } from '../common/errors';
import { pool } from '../db/pool';
import type { ApplicationStatus } from './application.state';
import type {
  ApplicationDetailsRow,
  ApplicationListRow,
  ApplicationRow,
  ConsentRow,
  ExperienceRow,
  ProgramChoiceRow,
  PublicationRow,
  StatusLogRow,
} from './form.types';

const APPLICATION_COLUMNS =
  'id, application_number, user_id, status, reviewer_supervisor_id, quota_supervisor_id, submitted_at, status_changed_at, return_reason, created_at, updated_at';

const LIST_COLUMNS =
  'application_id, application_number, status, status_changed_at, return_reason, reviewer_supervisor_id, ' +
  'email, name_en, full_name_zh, first_program_code, first_supervisor_name, second_program_code, second_supervisor_name';

/** 预处理语句允许的标量类型（mysql2 的 ExecuteValues） */
type SqlParam = string | number | boolean | Date | null;

/**
 * 统一的只读查询入口：传 conn 时走调用方事务，避免事务持有连接期间
 * 再向连接池借第二条连接（500 并发 Submit 时会造成池耗尽、互相等待）。
 */
const executeRows = async <T extends RowDataPacket>(
  sql: string,
  params: ReadonlyArray<SqlParam>,
  conn?: PoolConnection,
): Promise<T[]> => {
  const [rows] = conn
    ? await conn.execute<T[]>(sql, params as SqlParam[])
    : await pool.execute<T[]>(sql, params as SqlParam[]);
  return rows;
};

/** 列名来自 form_fields.storage_column，虽然可信，仍然做一次白名单校验 */
const assertIdentifier = (name: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw internal(`非法的数据库标识符：${name}`);
  }
  return name;
};

const escapeLike = (keyword: string): string => keyword.replace(/[\\%_]/g, (char) => `\\${char}`);

export interface CreateApplicationInput {
  id: string;
  applicationNumber: string;
  userId: string;
  now: Date;
}

export interface ProgramChoiceInput {
  rank: 1 | 2;
  programCode: string;
  supervisorId: number | null;
}

export interface ConsentInput {
  code: string;
  version: string;
  agreed: boolean;
}

export interface StatusUpdateInput {
  status: ApplicationStatus;
  submittedAt?: Date | null;
  returnReason?: string | null;
  reviewerSupervisorId?: number | null;
  /** 名额占位导师（需求 2.1）：null=释放，undefined=本次不改 */
  quotaSupervisorId?: number | null;
  now: Date;
}

export interface LogInput {
  applicationId: string;
  action: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  actorUserId: string;
  actorRole: string;
  remark?: string | null;
  now: Date;
}

export interface ListFilters {
  /** null 表示不限制（admin） */
  statuses: readonly ApplicationStatus[] | null;
  ownerUserId: string | null;
  reviewerSupervisorId: number | null;
  keyword: string | null;
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

const buildListWhere = (filters: ListFilters): { clause: string; params: SqlParam[] } => {
  const conditions: string[] = [];
  const params: SqlParam[] = [];

  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(`status IN (${filters.statuses.map(() => '?').join(', ')})`);
    params.push(...filters.statuses);
  }
  if (filters.ownerUserId) {
    conditions.push('email = (SELECT primary_email FROM users WHERE id = ?)');
    params.push(filters.ownerUserId);
  }
  if (filters.reviewerSupervisorId !== null) {
    conditions.push('reviewer_supervisor_id = ?');
    params.push(filters.reviewerSupervisorId);
  }
  if (filters.keyword && filters.keyword.trim().length > 0) {
    const like = `%${escapeLike(filters.keyword.trim())}%`;
    conditions.push('(application_number LIKE ? OR name_en LIKE ? OR full_name_zh LIKE ? OR email LIKE ?)');
    params.push(like, like, like, like);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
};

export const formRepository = {
  // ---------------- 申请单 ----------------

  async nextApplicationNumber(conn: PoolConnection, now: Date): Promise<string> {
    const [result] = await conn.execute<ResultSetHeader>(
      'INSERT INTO application_number_seq (issued_at) VALUES (?)',
      [now],
    );
    const year = String(now.getUTCFullYear()).slice(-2);
    return `${year}${String(result.insertId).padStart(9, '0')}`;
  },

  async insertApplication(conn: PoolConnection, input: CreateApplicationInput): Promise<void> {
    await conn.execute(
      `INSERT INTO applications
         (id, application_number, user_id, status, reviewer_supervisor_id, submitted_at,
          status_changed_at, return_reason, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', NULL, NULL, ?, NULL, ?, ?)`,
      [input.id, input.applicationNumber, input.userId, input.now, input.now, input.now],
    );
  },

  async findById(id: string): Promise<ApplicationRow | null> {
    const [rows] = await pool.execute<ApplicationRow[]>(
      `SELECT ${APPLICATION_COLUMNS} FROM applications WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async findByUserId(userId: string, conn?: PoolConnection): Promise<ApplicationRow | null> {
    const sql = `SELECT ${APPLICATION_COLUMNS} FROM applications WHERE user_id = ? LIMIT 1`;
    const [rows] = conn
      ? await conn.execute<ApplicationRow[]>(sql, [userId])
      : await pool.execute<ApplicationRow[]>(sql, [userId]);
    return rows[0] ?? null;
  },

  /** 列表视图里的一行（详情页复用，避免再拼一次 name/志愿） */
  async findListRow(id: string): Promise<ApplicationListRow | null> {
    const [rows] = await pool.execute<ApplicationListRow[]>(
      `SELECT ${LIST_COLUMNS} FROM v_application_list WHERE application_id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  },

  /** First Choice 导师变了要同步评审人，否则导师端看不到这份申请 */
  async updateReviewer(conn: PoolConnection, id: string, supervisorId: number | null, now: Date): Promise<void> {
    await conn.execute('UPDATE applications SET reviewer_supervisor_id = ?, updated_at = ? WHERE id = ?', [
      supervisorId,
      now,
      id,
    ]);
  },

  /** 所有状态流转都在事务里先锁这一行，避免并发重复提交 */
  async lockById(conn: PoolConnection, id: string): Promise<ApplicationRow | null> {
    const [rows] = await conn.execute<ApplicationRow[]>(
      `SELECT ${APPLICATION_COLUMNS} FROM applications WHERE id = ? FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  },

  async updateStatus(conn: PoolConnection, id: string, input: StatusUpdateInput): Promise<void> {
    const assignments = ['status = ?', 'status_changed_at = ?', 'updated_at = ?'];
    const params: SqlParam[] = [input.status, input.now, input.now];

    if (input.submittedAt !== undefined) {
      assignments.push('submitted_at = ?');
      params.push(input.submittedAt);
    }
    if (input.returnReason !== undefined) {
      assignments.push('return_reason = ?');
      params.push(input.returnReason);
    }
    if (input.reviewerSupervisorId !== undefined) {
      assignments.push('reviewer_supervisor_id = ?');
      params.push(input.reviewerSupervisorId);
    }
    if (input.quotaSupervisorId !== undefined) {
      assignments.push('quota_supervisor_id = ?');
      params.push(input.quotaSupervisorId);
    }
    params.push(id);

    await conn.execute(`UPDATE applications SET ${assignments.join(', ')} WHERE id = ?`, params);
  },

  async touch(conn: PoolConnection, id: string, now: Date): Promise<void> {
    await conn.execute('UPDATE applications SET updated_at = ? WHERE id = ?', [now, id]);
  },

  async insertLog(conn: PoolConnection, input: LogInput): Promise<void> {
    await conn.execute(
      `INSERT INTO application_status_logs
         (application_id, from_status, to_status, action, actor_user_id, actor_role, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.applicationId,
        input.fromStatus,
        input.toStatus,
        input.action,
        input.actorUserId,
        input.actorRole,
        input.remark ?? null,
        input.now,
      ],
    );
  },

  async listLogs(applicationId: string): Promise<StatusLogRow[]> {
    const [rows] = await pool.execute<StatusLogRow[]>(
      `SELECT id, action, from_status, to_status, actor_role, remark, created_at
         FROM application_status_logs
        WHERE application_id = ?
        ORDER BY created_at, id`,
      [applicationId],
    );
    return rows;
  },

  // ---------------- 1:1 明细 ----------------

  /**
   * 把 values 里属于 application_details 的部分写进去。
   * entries 的列名来自 form_fields.storage_column（已过白名单校验）。
   */
  async upsertDetails(
    conn: PoolConnection,
    applicationId: string,
    entries: ReadonlyArray<[string, unknown]>,
    now: Date,
  ): Promise<void> {
    if (entries.length === 0) {
      await conn.execute('UPDATE application_details SET updated_at = ? WHERE application_id = ?', [now, applicationId]);
      return;
    }

    const columns = entries.map(([column]) => assertIdentifier(column));
    const quoted = columns.map((column) => `\`${column}\``);
    const updates = quoted.map((column) => `${column} = VALUES(${column})`).join(', ');

    await conn.execute(
      `INSERT INTO application_details (application_id, ${quoted.join(', ')}, created_at, updated_at)
       VALUES (?, ${columns.map(() => '?').join(', ')}, ?, ?)
       ON DUPLICATE KEY UPDATE ${updates}, updated_at = VALUES(updated_at)`,
      [applicationId, ...entries.map(([, value]) => (value ?? null) as SqlParam), now, now],
    );
  },

  async loadDetails(applicationId: string, conn?: PoolConnection): Promise<ApplicationDetailsRow | null> {
    const rows = await executeRows<ApplicationDetailsRow>(
      'SELECT * FROM application_details WHERE application_id = ? LIMIT 1',
      [applicationId],
      conn,
    );
    return rows[0] ?? null;
  },

  // ---------------- 志愿 ----------------

  /** 整组覆盖：先删后插，避免 1/2 名次互换时撞唯一键 */
  async replaceChoices(
    conn: PoolConnection,
    applicationId: string,
    choices: readonly ProgramChoiceInput[],
    now: Date,
  ): Promise<void> {
    await conn.execute('DELETE FROM application_program_choices WHERE application_id = ?', [applicationId]);
    for (const choice of choices) {
      await conn.execute(
        `INSERT INTO application_program_choices
           (id, application_id, choice_rank, program_code, supervisor_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          applicationId,
          choice.rank,
          choice.programCode,
          choice.supervisorId,
          now,
          now,
        ],
      );
    }
  },

  async loadChoices(applicationId: string, conn?: PoolConnection): Promise<ProgramChoiceRow[]> {
    return executeRows<ProgramChoiceRow>(
      `SELECT id, application_id, choice_rank, program_code, supervisor_id
         FROM application_program_choices
        WHERE application_id = ?
        ORDER BY choice_rank`,
      [applicationId],
      conn,
    );
  },

  // ---------------- 可重复小节 ----------------

  async replaceChildren(
    conn: PoolConnection,
    table: 'application_publications' | 'application_experiences',
    applicationId: string,
    rows: ReadonlyArray<Record<string, unknown>>,
    now: Date,
  ): Promise<void> {
    await conn.execute(`DELETE FROM ${assertIdentifier(table)} WHERE application_id = ?`, [applicationId]);

    for (const [index, row] of rows.entries()) {
      const columns = Object.keys(row).filter((key) => row[key] !== undefined).map(assertIdentifier);
      const quoted = columns.map((column) => `\`${column}\``);
      await conn.execute(
        `INSERT INTO ${table} (id, application_id, row_no${columns.length > 0 ? `, ${quoted.join(', ')}` : ''}, created_at, updated_at)
         VALUES (?, ?, ?${columns.length > 0 ? `, ${columns.map(() => '?').join(', ')}` : ''}, ?, ?)`,
        [newId(), applicationId, index + 1, ...columns.map((column) => (row[column] ?? null) as SqlParam), now, now],
      );
    }
  },

  async loadPublications(applicationId: string, conn?: PoolConnection): Promise<PublicationRow[]> {
    return executeRows<PublicationRow>(
      `SELECT id, row_no, title, venue, authors, publish_date, publication_status, url
         FROM application_publications
        WHERE application_id = ?
        ORDER BY row_no`,
      [applicationId],
      conn,
    );
  },

  async loadExperiences(applicationId: string, conn?: PoolConnection): Promise<ExperienceRow[]> {
    return executeRows<ExperienceRow>(
      `SELECT id, row_no, experience_type, organization, position, period_start, period_end, responsibilities
         FROM application_experiences
        WHERE application_id = ?
        ORDER BY row_no`,
      [applicationId],
      conn,
    );
  },

  // ---------------- 声明勾选 ----------------

  async upsertConsents(
    conn: PoolConnection,
    applicationId: string,
    consents: readonly ConsentInput[],
    now: Date,
  ): Promise<void> {
    for (const consent of consents) {
      await conn.execute(
        `INSERT INTO application_consents
           (application_id, statement_code, statement_version, agreed, agreed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           statement_version = VALUES(statement_version),
           agreed = VALUES(agreed),
           agreed_at = VALUES(agreed_at),
           updated_at = VALUES(updated_at)`,
        [applicationId, consent.code, consent.version, consent.agreed, consent.agreed ? now : null, now, now],
      );
    }
  },

  async loadConsents(applicationId: string, conn?: PoolConnection): Promise<ConsentRow[]> {
    return executeRows<ConsentRow>(
      `SELECT application_id, statement_code, statement_version, agreed, agreed_at
         FROM application_consents
        WHERE application_id = ?`,
      [applicationId],
      conn,
    );
  },

  // ---------------- 列表 ----------------

  async list(filters: ListFilters, page: PageQuery): Promise<ApplicationListRow[]> {
    const { clause, params } = buildListWhere(filters);
    const offset = (page.page - 1) * page.pageSize;

    const [rows] = await pool.execute<ApplicationListRow[]>(
      `SELECT ${LIST_COLUMNS} FROM v_application_list ${clause}
        ORDER BY status_changed_at DESC, application_id DESC
        LIMIT ${Number(page.pageSize)} OFFSET ${Number(offset)}`,
      params,
    );
    return rows;
  },

  async count(filters: ListFilters): Promise<number> {
    const { clause, params } = buildListWhere(filters);
    const [rows] = await pool.execute<Array<{ total: number } & import('mysql2/promise').RowDataPacket>>(
      `SELECT COUNT(*) AS total FROM v_application_list ${clause}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  },
};
