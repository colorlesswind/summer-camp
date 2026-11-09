import { pool } from '../db/pool';
import type {
  ExamRow,
  FieldRow,
  OptionRow,
  ProgramRow,
  SectionRow,
  SubmissionWindowRow,
} from './form.types';

/**
 * 表单配置的只读仓储。这一层只做 SQL，不做缓存与组装。
 * 表结构见 db/migrations/003_application_schema.sql 第 2 节。
 */
export const formConfigRepository = {
  async listSections(): Promise<SectionRow[]> {
    const [rows] = await pool.execute<SectionRow[]>(
      `SELECT code, title_en, title_zh, payload_key, is_repeatable, is_enabled, sort_order
         FROM form_sections
        ORDER BY sort_order, code`,
    );
    return rows;
  },

  async listFields(): Promise<FieldRow[]> {
    const [rows] = await pool.execute<FieldRow[]>(
      `SELECT code, section_code, group_code, label_en, label_zh, widget, value_type,
              is_required, max_length, options_source, depends_on_field, guide_text_en,
              storage_table, storage_column, sort_order, is_enabled
         FROM form_fields
        ORDER BY section_code, sort_order, code`,
    );
    return rows;
  },

  async listOptions(): Promise<OptionRow[]> {
    const [rows] = await pool.execute<OptionRow[]>(
      `SELECT field_code, value, label_en, label_zh, sort_order
         FROM form_field_options
        WHERE is_active = TRUE
        ORDER BY field_code, sort_order, value`,
    );
    return rows;
  },

  async listPrograms(): Promise<ProgramRow[]> {
    const [rows] = await pool.execute<ProgramRow[]>(
      `SELECT code, name_en, thrust_name_en, sort_order
         FROM programs
        WHERE is_active = TRUE
        ORDER BY sort_order, code`,
    );
    return rows;
  },

  async listExams(): Promise<ExamRow[]> {
    const [rows] = await pool.execute<ExamRow[]>(
      `SELECT code, label_en, sort_order FROM exams WHERE is_active = TRUE ORDER BY sort_order, code`,
    );
    return rows;
  },

  /** 取仍然有效的提交窗口（已结束的不返回） */
  async listOpenWindows(now: Date): Promise<SubmissionWindowRow[]> {
    const [rows] = await pool.execute<SubmissionWindowRow[]>(
      `SELECT id, label, opens_at, closes_at
         FROM submission_windows
        WHERE is_active = TRUE AND closes_at >= ?
        ORDER BY opens_at`,
      [now],
    );
    return rows;
  },

  /** 窗口总数：为 0 表示运维还没配，此时不限制保存/提交 */
  async countAllWindows(): Promise<number> {
    const [rows] = await pool.execute<Array<{ total: number } & import('mysql2/promise').RowDataPacket>>(
      'SELECT COUNT(*) AS total FROM submission_windows',
    );
    return Number(rows[0]?.total ?? 0);
  },
};
