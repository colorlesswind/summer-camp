import type { RowDataPacket } from 'mysql2/promise';
import type { ApplicationStatus } from './application.state';
import type { UserRole } from '../user/user.types';

/** 一页申请的元信息。status 与 form/application.state.ts 的枚举值完全一致 */
export interface ApplicationRow extends RowDataPacket {
  id: string;
  application_number: string;
  user_id: string;
  status: ApplicationStatus;
  reviewer_supervisor_id: number | null;
  submitted_at: Date | null;
  status_changed_at: Date;
  return_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

/** v_application_list 视图的一行（列表页一次查询所需全部字段） */
export interface ApplicationListRow extends RowDataPacket {
  application_id: string;
  application_number: string;
  status: ApplicationStatus;
  status_changed_at: Date;
  return_reason: string | null;
  reviewer_supervisor_id: number | null;
  email: string;
  name_en: string | null;
  full_name_zh: string | null;
  first_program_code: string | null;
  first_supervisor_name: string | null;
  second_program_code: string | null;
  second_supervisor_name: string | null;
}

export interface ApplicationDetailsRow extends RowDataPacket {
  application_id: string;
  created_at: Date;
  updated_at: Date;
  [column: string]: unknown;
}

export interface ProgramChoiceRow extends RowDataPacket {
  id: string;
  application_id: string;
  choice_rank: number;
  program_code: string;
  supervisor_id: number | null;
}

export interface PublicationRow extends RowDataPacket {
  id: string;
  row_no: number;
  title: string | null;
  venue: string | null;
  authors: string | null;
  publish_date: Date | null;
  publication_status: string | null;
  url: string | null;
}

export interface ExperienceRow extends RowDataPacket {
  id: string;
  row_no: number;
  experience_type: string | null;
  organization: string | null;
  position: string | null;
  period_start: Date | null;
  period_end: Date | null;
  responsibilities: string | null;
}

export interface ConsentRow extends RowDataPacket {
  application_id: string;
  statement_code: string;
  statement_version: string;
  agreed: number | boolean;
  agreed_at: Date | null;
}

export interface StatusLogRow extends RowDataPacket {
  id: number;
  action: string;
  from_status: string | null;
  to_status: string;
  actor_role: string | null;
  remark: string | null;
  created_at: Date;
}

export interface SupervisorRow extends RowDataPacket {
  id: number;
  user_emp_id: string;
  name: string;
  name_zh: string | null;
  email: string;
  thrust_code: string;
  dept_name_en: string;
  is_active: number | boolean;
}

export interface SectionRow extends RowDataPacket {
  code: string;
  title_en: string;
  title_zh: string | null;
  payload_key: string | null;
  is_repeatable: number | boolean;
  is_enabled: number | boolean;
  sort_order: number;
}

export interface FieldRow extends RowDataPacket {
  code: string;
  section_code: string;
  group_code: string | null;
  label_en: string;
  label_zh: string | null;
  widget: string;
  value_type: string;
  is_required: number | boolean;
  max_length: number | null;
  options_source: string | null;
  depends_on_field: string | null;
  guide_text_en: string | null;
  storage_table: string | null;
  storage_column: string | null;
  sort_order: number;
  is_enabled: number | boolean;
}

export interface OptionRow extends RowDataPacket {
  field_code: string;
  value: string;
  label_en: string;
  label_zh: string | null;
  sort_order: number;
}

export interface ProgramRow extends RowDataPacket {
  code: string;
  name_en: string;
  thrust_name_en: string;
  sort_order: number;
}

export interface ExamRow extends RowDataPacket {
  code: string;
  label_en: string;
  sort_order: number;
}

export interface StatementDefinitionRow extends RowDataPacket {
  code: string;
  version: string;
  text_en: string;
  text_zh: string | null;
  effective_from: Date;
}

export interface SubmissionWindowRow extends RowDataPacket {
  id: string;
  label: string | null;
  opens_at: Date;
  closes_at: Date;
}

/** API 的 values：key 就是 form_fields.code */
export type FormValues = Record<string, unknown>;

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface TimelineEntry {
  action: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: string | null;
  remark: string | null;
  at: string;
}

export interface ApplicationSummary {
  id: string;
  applicationNumber: string;
  nameEn: string | null;
  fullNameZh: string | null;
  email: string;
  status: ApplicationStatus;
  displayStatus: string;
  returnReason: string | null;
  updatedAt: string;
  firstProgramCode: string | null;
  firstSupervisorName: string | null;
  secondProgramCode: string | null;
  secondSupervisorName: string | null;
}

export interface ApplicationDetail extends ApplicationSummary {
  submittedAt: string | null;
  editable: boolean;
  /** 服务端算好的可执行动作，前端只做按钮显隐 */
  actions: string[];
  values: FormValues;
  timeline: TimelineEntry[];
}

export interface ApplicationListResult {
  items: ApplicationSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApplicationScope {
  role: UserRole;
  userId: string;
  /** 导师视角：当前账号绑定的 supervisors.id */
  supervisorId: number | null;
}
