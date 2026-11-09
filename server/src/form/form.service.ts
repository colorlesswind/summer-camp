import type { PoolConnection } from 'mysql2/promise';
import type { AuthContext } from '../user/user.types';
import { newId } from '../common/crypto';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { withTransaction } from '../db/pool';
import {
  assertCan,
  assertOwnership,
  canPerform,
  type ApplicationAction,
  type ApplicationStatus,
} from './application.state';
import { formConfigService, type CompiledForm, type FieldConfig } from './form.config.service';
import {
  isVisibleToSupervisor,
  SUPERVISOR_VISIBLE_STATUSES,
  toDisplayStatus,
} from './form.display';
import { formRepository, type ConsentInput, type ProgramChoiceInput } from './form.repository';
import { isNil, validateRowItems, validateScalarValues } from './form.validation';
import { supervisorRepository } from './supervisor.repository';
import type {
  ApplicationDetail,
  ApplicationListResult,
  ApplicationListRow,
  ApplicationRow,
  ApplicationScope,
  ApplicationSummary,
  FormValues,
  StatusLogRow,
  TimelineEntry,
  ValidationIssue,
} from './form.types';

type ChildTable = 'application_publications' | 'application_experiences';

/** 声明勾选框 → statement_definitions.code 的固定映射 */
const CONSENT_STATEMENTS: Record<string, string> = {
  consentDeclaration: 'DECLARATION',
  consentMedia: 'MEDIA_CONSENT',
};

const STATEMENT_VERSION = 'v1';

/** 批量 Send Offer：单条子流程超时时间（需求 2.2「超时认为处理失败」） */
const BATCH_ITEM_TIMEOUT_MS = 3000;
const BATCH_CONCURRENCY = 10;

const toDateOnly = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : null;
};

const toIso = (value: Date | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

const toBooleanOrNull = (value: unknown): boolean | null => {
  if (value === null || value === undefined) return null;
  return Boolean(value);
};

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  return Number(value);
};

const hasOwn = (target: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

const readScalar = (field: FieldConfig, raw: unknown): unknown => {
  if (field.valueType === 'date') return toDateOnly(raw);
  if (field.valueType === 'boolean') return toBooleanOrNull(raw);
  return raw ?? null;
};

const assignIfField = (form: CompiledForm, values: FormValues, code: string, value: unknown): void => {
  if (form.fieldByCode.has(code)) values[code] = value;
};

const mapRowToValues = (fields: readonly FieldConfig[], row: Record<string, unknown>): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.storageColumn) continue;
    values[field.code] = readScalar(field, row[field.storageColumn]);
  }
  return values;
};

const mapValuesToRow = (fields: readonly FieldConfig[], values: Record<string, unknown>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.storageColumn) continue;
    if (!hasOwn(values, field.code)) continue;
    row[field.storageColumn] = values[field.code];
  }
  return row;
};

const buildChoices = (values: FormValues): ProgramChoiceInput[] => {
  const choices: ProgramChoiceInput[] = [];

  if (!isNil(values.programFirstId)) {
    choices.push({
      rank: 1,
      programCode: String(values.programFirstId),
      supervisorId: toNumberOrNull(values.supervisorFirstId),
    });
  }
  if (!isNil(values.programSecondId)) {
    choices.push({
      rank: 2,
      programCode: String(values.programSecondId),
      supervisorId: toNumberOrNull(values.supervisorSecondId),
    });
  }
  return choices;
};

const nextStatus = (action: ApplicationAction, current: ApplicationStatus): ApplicationStatus => {
  switch (action) {
    case 'submit':
    case 'resubmit':
      return 'PendingForPreliminaryScreening';
    case 'approve':
      return 'PendingSupervisorReview';
    case 'return':
      return 'Returned';
    case 'recommend':
      return 'SupervisorRecommended';
    case 'reject':
      return 'SupervisorRejected';
    case 'send_offer':
      return 'OfferSent';
    case 'accept_offer':
      return 'OfferAccepted';
    case 'decline_offer':
      return 'OfferDeclined';
    default:
      return current;
  }
};

const validationError = (issues: readonly ValidationIssue[]): AppError =>
  new AppError(400, 'validation_failed', '表单校验未通过', issues);

const toSummary = (row: ApplicationListRow, role: AuthContext['role']): ApplicationSummary => ({
  id: row.application_id,
  applicationNumber: row.application_number,
  nameEn: row.name_en,
  fullNameZh: row.full_name_zh,
  email: row.email,
  status: row.status,
  displayStatus: toDisplayStatus(row.status, role),
  returnReason: row.return_reason,
  updatedAt: toIso(row.status_changed_at) ?? '',
  firstProgramCode: row.first_program_code,
  firstSupervisorName: row.first_supervisor_name,
  secondProgramCode: row.second_program_code,
  secondSupervisorName: row.second_supervisor_name,
});

const toTimelineEntry = (log: StatusLogRow): TimelineEntry => ({
  action: log.action,
  fromStatus: log.from_status,
  toStatus: log.to_status,
  actorRole: log.actor_role,
  remark: log.remark,
  at: toIso(log.created_at) ?? '',
});

/** 可执行动作 = 状态机允许 且 角色/归属/时间窗允许 */
const computeActions = (
  role: AuthContext['role'],
  status: ApplicationStatus,
  context: { isOwner: boolean; isAssigned: boolean; submitWindowOpen: boolean; saveWindowOpen: boolean },
): ApplicationAction[] => {
  const candidates: ApplicationAction[] = [
    'save',
    'submit',
    'resubmit',
    'approve',
    'return',
    'recommend',
    'reject',
    'send_offer',
    'accept_offer',
    'decline_offer',
  ];

  return candidates.filter((action) => {
    if (!canPerform(action, role, status)) return false;
    if (role === 'student' && !context.isOwner) return false;
    if (role === 'supervisor' && !context.isAssigned) return false;
    if (action === 'submit' && !context.submitWindowOpen) return false;
    if (action === 'save' && status === 'Draft' && !context.saveWindowOpen) return false;
    return true;
  });
};

export interface ListQuery {
  status?: readonly ApplicationStatus[];
  keyword?: string;
  page: number;
  pageSize: number;
}

export interface SupervisorOption {
  id: number;
  name: string;
  nameZh: string | null;
  userEmpId: string;
  thrustCode: string;
  deptNameEn: string;
}

export interface BatchFailure {
  id: string;
  applicationNumber: string | null;
  code: string;
  message: string;
}

export interface BatchOfferResult {
  total: number;
  successCount: number;
  failureCount: number;
  failures: BatchFailure[];
}

interface PreparedSave {
  details: Array<[string, unknown]>;
  choices: ProgramChoiceInput[];
  children: Array<{ table: ChildTable; rows: Array<Record<string, unknown>> }>;
  consents: ConsentInput[];
  touchedChoice: boolean;
}

type TimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; timeout: true }
  | { ok: false; timeout: false; error: unknown };

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<TimeoutResult<T>> => {
  let timer: NodeJS.Timeout | undefined;

  const settled: Promise<TimeoutResult<T>> = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, timeout: false as const, error }),
  );

  const timedOut = new Promise<TimeoutResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false as const, timeout: true as const }), ms);
  });

  try {
    return await Promise.race([settled, timedOut]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T);
    }
  });

  await Promise.all(runners);
  return results;
};

export const formService = {
  // ---------------- 配置 ----------------

  async getSchema() {
    const form = await formConfigService.getCompiled();
    const windowState = await formConfigService.getWindowState(new Date());

    return {
      meta: {
        serverTime: new Date().toISOString(),
        submissionWindow: windowState,
      },
      sections: form.enabledSections.map((section) => ({
        code: section.code,
        titleEn: section.titleEn,
        titleZh: section.titleZh,
        payloadKey: section.payloadKey,
        isRepeatable: section.isRepeatable,
        sortOrder: section.sortOrder,
        fields: section.fields.map((field) => ({
          code: field.code,
          sectionCode: field.sectionCode,
          groupCode: field.groupCode,
          labelEn: field.labelEn,
          labelZh: field.labelZh,
          widget: field.widget,
          isRequired: field.isRequired,
          maxLength: field.maxLength,
          optionsSource: field.optionsSource,
          dependsOnField: field.dependsOnField,
          guideTextEn: field.guideTextEn,
          options: field.options.length > 0 ? field.options : undefined,
        })),
      })),
      enums: {
        programs: form.programs,
        exams: form.exams,
      },
    };
  },

  async searchSupervisors(programCode: string, keyword: string | undefined, limit: number): Promise<SupervisorOption[]> {
    const form = await formConfigService.getCompiled();
    if (!form.programs.some((program) => program.value === programCode)) {
      throw new AppError(400, 'invalid_option', '未知的 Program', { code: 'invalid_option', programCode });
    }

    const rows = await supervisorRepository.searchByProgram(programCode, keyword, limit);
    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      nameZh: row.name_zh,
      userEmpId: row.user_emp_id,
      thrustCode: row.thrust_code,
      deptNameEn: row.dept_name_en,
    }));
  },

  // ---------------- 列表 / 详情 ----------------

  async resolveScope(auth: AuthContext): Promise<ApplicationScope> {
    if (auth.role !== 'supervisor') {
      return { role: auth.role, userId: auth.userId, supervisorId: null };
    }
    const supervisor = await supervisorRepository.findByUserId(auth.userId);
    if (!supervisor) {
      throw forbidden('当前账号尚未绑定导师档案，无法查看申请', { code: 'supervisor_not_registered' });
    }
    return { role: 'supervisor', userId: auth.userId, supervisorId: Number(supervisor.id) };
  },

  async list(auth: AuthContext, query: ListQuery): Promise<ApplicationListResult> {
    const scope = await this.resolveScope(auth);
    const requested = query.status ?? [];
    let statuses: readonly ApplicationStatus[] | null = null;

    if (scope.role === 'supervisor') {
      const visible = requested.length > 0
        ? requested.filter((status) => SUPERVISOR_VISIBLE_STATUSES.includes(status))
        : [...SUPERVISOR_VISIBLE_STATUSES];

      // 导师筛选了「对自己不可见」的状态 -> 返回空列表，而不是忽略筛选
      if (visible.length === 0) {
        return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
      }
      statuses = visible;
    } else if (requested.length > 0) {
      statuses = requested;
    }

    const filters = {
      statuses,
      ownerUserId: scope.role === 'student' ? scope.userId : null,
      reviewerSupervisorId: scope.role === 'supervisor' ? scope.supervisorId : null,
      keyword: query.keyword ?? null,
    };

    const [rows, total] = await Promise.all([
      formRepository.list(filters, { page: query.page, pageSize: query.pageSize }),
      formRepository.count(filters),
    ]);

    return {
      items: rows.map((row) => toSummary(row, auth.role)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  async getDetail(auth: AuthContext, id: string): Promise<ApplicationDetail> {
    const scope = await this.resolveScope(auth);
    const row = await formRepository.findById(id);
    if (!row) throw notFound('申请不存在');

    const isOwner = row.user_id === scope.userId;
    const isAssigned =
      scope.supervisorId !== null && toNumberOrNull(row.reviewer_supervisor_id) === scope.supervisorId;

    if (scope.role === 'student') {
      assertOwnership(scope.userId, row.user_id);
    }
    // 导师端「未进入导师审核」的申请业务上不可见，统一按 404 处理，避免探测
    if (scope.role === 'supervisor' && !(isAssigned && isVisibleToSupervisor(row.status))) {
      throw notFound('申请不存在');
    }

    const form = await formConfigService.getCompiled();
    const now = new Date();
    const [windowState, saveWindowOpen, listRow, values, logs] = await Promise.all([
      formConfigService.getWindowState(now),
      formConfigService.isSaveAllowed(now),
      formRepository.findListRow(id),
      this.loadValues(id, form),
      formRepository.listLogs(id),
    ]);

    if (!listRow) throw notFound('申请不存在');
    const summary = toSummary(listRow, auth.role);

    // readonly 字段（登录邮箱）由账号派生，不落库，读取时补上
    if (form.fieldByCode.has('email')) values.email = listRow.email;

    const actions = computeActions(scope.role, row.status, {
      isOwner,
      isAssigned,
      submitWindowOpen: windowState.isOpen,
      saveWindowOpen,
    });

    const editable =
      scope.role === 'student' &&
      isOwner &&
      (row.status === 'Returned' || (row.status === 'Draft' && saveWindowOpen));

    return {
      ...summary,
      submittedAt: toIso(row.submitted_at),
      editable,
      actions,
      values,
      timeline: logs.map(toTimelineEntry),
    };
  },

  async mine(auth: AuthContext): Promise<ApplicationDetail | null> {
    const row = await formRepository.findByUserId(auth.userId);
    if (!row) return null;
    return this.getDetail(auth, row.id);
  },

  async history(auth: AuthContext, id: string) {
    const detail = await this.getDetail(auth, id);
    return { applicationId: detail.id, timeline: detail.timeline };
  },

  // ---------------- 学生写操作 ----------------

  async create(auth: AuthContext, values: FormValues): Promise<ApplicationDetail> {
    const now = new Date();
    await formConfigService.assertSaveAllowed(now);

    const form = await formConfigService.getCompiled();
    const prepared = await this.prepareSave(form, values, {});

    const createdId = await withTransaction(async (conn) => {
      const existing = await formRepository.findByUserId(auth.userId);
      if (existing) {
        throw conflict('该账号已存在申请，请直接编辑', {
          code: 'application_exists',
          applicationId: existing.id,
        });
      }

      const applicationNumber = await formRepository.nextApplicationNumber(conn, now);
      const id = newId();
      await formRepository.insertApplication(conn, { id, applicationNumber, userId: auth.userId, now });
      await this.persist(conn, id, prepared, now);

      if (prepared.touchedChoice) {
        const supervisorFirstId = prepared.choices.find((choice) => choice.rank === 1)?.supervisorId ?? null;
        if (supervisorFirstId !== null) {
          await formRepository.updateReviewer(conn, id, supervisorFirstId, now);
        }
      }

      await formRepository.insertLog(conn, {
        applicationId: id,
        action: 'save',
        fromStatus: null,
        toStatus: 'Draft',
        actorUserId: auth.userId,
        actorRole: auth.role,
        remark: '首次保存，生成 Application No.',
        now,
      });

      return id;
    });

    return this.getDetail(auth, createdId);
  },

  async save(auth: AuthContext, id: string, values: FormValues): Promise<ApplicationDetail> {
    const now = new Date();
    const form = await formConfigService.getCompiled();

    await withTransaction(async (conn) => {
      const row = await formRepository.lockById(conn, id);
      if (!row) throw notFound('申请不存在');
      assertOwnership(auth.userId, row.user_id);
      assertCan('save', auth.role, row.status);
      if (row.status === 'Draft') {
        await formConfigService.assertSaveAllowed(now);
      }

      const existing = await this.loadValues(id, form);
      const prepared = await this.prepareSave(form, values, existing);
      await this.persist(conn, id, prepared, now);

      if (prepared.touchedChoice) {
        const supervisorFirstId = prepared.choices.find((choice) => choice.rank === 1)?.supervisorId ?? null;
        const currentReviewer = toNumberOrNull(row.reviewer_supervisor_id);
        if (supervisorFirstId !== currentReviewer) {
          await formRepository.updateReviewer(conn, id, supervisorFirstId, now);
          await formRepository.insertLog(conn, {
            applicationId: id,
            action: 'save',
            fromStatus: row.status,
            toStatus: row.status,
            actorUserId: auth.userId,
            actorRole: auth.role,
            remark: '变更 First Choice 导师，同步评审人',
            now,
          });
        }
      } else {
        await formRepository.touch(conn, id, now);
      }
    });

    return this.getDetail(auth, id);
  },

  async submit(auth: AuthContext, id: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'submit', async (row, now) => {
      if (row.status === 'Draft') await formConfigService.assertSubmitAllowed(now);
    });
  },

  async resubmit(auth: AuthContext, id: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'resubmit');
  },

  // ---------------- 审核动作 ----------------

  async approve(auth: AuthContext, id: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'approve');
  },

  async returnToStudent(auth: AuthContext, id: string, reason: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'return', undefined, { returnReason: reason, remark: reason });
  },

  async recommend(auth: AuthContext, id: string, remark?: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'recommend', undefined, { remark: remark ?? null });
  },

  async reject(auth: AuthContext, id: string, remark?: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'reject', undefined, { remark: remark ?? null });
  },

  async sendOffer(auth: AuthContext, id: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'send_offer');
  },

  async acceptOffer(auth: AuthContext, id: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'accept_offer');
  },

  async declineOffer(auth: AuthContext, id: string): Promise<ApplicationDetail> {
    return this.transition(auth, id, 'decline_offer');
  },

  /**
   * 批量 Send Offer（需求 2.2）：每条申请一个独立事务 + 独立子流程，
   * 超出 BATCH_ITEM_TIMEOUT_MS 视为该条失败，其余照常汇总。
   */
  async sendOfferBatch(auth: AuthContext, ids: readonly string[]): Promise<BatchOfferResult> {
    const unique = [...new Set(ids)];

    const results = await mapWithConcurrency(unique, BATCH_CONCURRENCY, async (id) => {
      const raced = await withTimeout(this.sendOffer(auth, id), BATCH_ITEM_TIMEOUT_MS);
      if (raced.ok) return { id, ok: true as const };
      if (raced.timeout) return { id, ok: false as const, code: 'timeout', message: '处理超时，请稍后重试' };

      const error = raced.error;
      if (error instanceof AppError) {
        const reason = (error.details as { code?: string } | undefined)?.code;
        return { id, ok: false as const, code: reason ?? error.code, message: error.message };
      }
      return { id, ok: false as const, code: 'internal_error', message: '服务器内部错误' };
    });

    const failures: BatchFailure[] = [];
    for (const result of results) {
      if (result.ok) continue;
      const row = await formRepository.findById(result.id);
      failures.push({
        id: result.id,
        applicationNumber: row?.application_number ?? null,
        code: result.code,
        message: result.message,
      });
    }

    return {
      total: unique.length,
      successCount: unique.length - failures.length,
      failureCount: failures.length,
      failures,
    };
  },

  // ---------------- 内部实现 ----------------

  async loadValues(id: string, form: CompiledForm): Promise<FormValues> {
    const [details, choices, publications, experiences, consents] = await Promise.all([
      formRepository.loadDetails(id),
      formRepository.loadChoices(id),
      formRepository.loadPublications(id),
      formRepository.loadExperiences(id),
      formRepository.loadConsents(id),
    ]);

    const values: FormValues = {};

    for (const field of form.enabledFields) {
      const section = form.sectionByCode.get(field.sectionCode);
      if (!section || section.isRepeatable) continue;
      if (field.storageTable === 'application_details' && field.storageColumn) {
        values[field.code] = readScalar(field, details ? details[field.storageColumn] : null);
      }
    }

    const first = choices.find((choice) => choice.choice_rank === 1) ?? null;
    const second = choices.find((choice) => choice.choice_rank === 2) ?? null;
    assignIfField(form, values, 'programFirstId', first?.program_code ?? null);
    assignIfField(form, values, 'supervisorFirstId', toNumberOrNull(first?.supervisor_id ?? null));
    assignIfField(form, values, 'programSecondId', second?.program_code ?? null);
    assignIfField(form, values, 'supervisorSecondId', toNumberOrNull(second?.supervisor_id ?? null));

    for (const [code, statementCode] of Object.entries(CONSENT_STATEMENTS)) {
      if (!form.fieldByCode.has(code)) continue;
      const consent = consents.find((row) => row.statement_code === statementCode);
      values[code] = consent ? Boolean(consent.agreed) : null;
    }

    const publicationsSection = form.sections.find((section) => section.code === 'PUBLICATIONS');
    if (publicationsSection?.payloadKey) {
      values[publicationsSection.payloadKey] = publications.map((row) =>
        mapRowToValues(publicationsSection.fields, row as unknown as Record<string, unknown>),
      );
    }

    const experienceSection = form.sections.find((section) => section.code === 'WORK_EXPERIENCE');
    if (experienceSection?.payloadKey) {
      values[experienceSection.payloadKey] = experiences.map((row) =>
        mapRowToValues(experienceSection.fields, row as unknown as Record<string, unknown>),
      );
    }

    return values;
  },

  /** 把前端提交的 values 校验并拆成「明细 / 志愿 / 子表 / 声明」四组可落库数据 */
  async prepareSave(form: CompiledForm, raw: FormValues, existing: FormValues): Promise<PreparedSave> {
    const repeatableKeys = new Set(
      form.enabledSections
        .filter((section) => section.isRepeatable && section.payloadKey)
        .map((section) => section.payloadKey as string),
    );

    const scalarFields = form.enabledFields.filter((field) => {
      const section = form.sectionByCode.get(field.sectionCode);
      // readonly = 由账号派生（登录邮箱），不参与必填校验
      return section !== undefined && !section.isRepeatable && field.widget !== 'readonly';
    });

    const scalarRaw: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (repeatableKeys.has(key)) continue;
      scalarRaw[key] = value;
    }

    const { values, issues } = validateScalarValues(scalarRaw, scalarFields, 'save');
    if (issues.length > 0) throw validationError(issues);

    const merged: FormValues = { ...existing, ...values };
    const crossIssues: ValidationIssue[] = [];
    await this.crossCheck(form, merged, crossIssues, 'save');
    if (crossIssues.length > 0) throw validationError(crossIssues);

    const details: Array<[string, unknown]> = [];
    for (const field of scalarFields) {
      if (field.storageTable !== 'application_details' || !field.storageColumn) continue;
      if (!hasOwn(values, field.code)) continue;
      details.push([field.storageColumn, values[field.code]]);
    }

    const choiceKeys = ['programFirstId', 'supervisorFirstId', 'programSecondId', 'supervisorSecondId'];
    const touchedChoice = choiceKeys.some((key) => hasOwn(values, key));

    const children: Array<{ table: ChildTable; rows: Array<Record<string, unknown>> }> = [];
    for (const section of form.enabledSections) {
      if (!section.isRepeatable || !section.payloadKey) continue;
      if (!hasOwn(raw, section.payloadKey)) continue;

      const table: ChildTable | null =
        section.code === 'PUBLICATIONS'
          ? 'application_publications'
          : section.code === 'WORK_EXPERIENCE'
            ? 'application_experiences'
            : null;
      if (!table) continue;

      const { rows, issues: rowIssues } = validateRowItems(raw[section.payloadKey], section.fields, section.titleEn);
      if (rowIssues.length > 0) throw validationError(rowIssues);
      children.push({ table, rows: rows.map((row) => mapValuesToRow(section.fields, row)) });
    }

    const consents: ConsentInput[] = [];
    for (const [code, statementCode] of Object.entries(CONSENT_STATEMENTS)) {
      if (!hasOwn(values, code)) continue;
      consents.push({ code: statementCode, version: STATEMENT_VERSION, agreed: Boolean(values[code]) });
    }

    return {
      details,
      choices: touchedChoice ? buildChoices(merged) : [],
      children,
      consents,
      touchedChoice,
    };
  },

  async persist(conn: PoolConnection, id: string, prepared: PreparedSave, now: Date): Promise<void> {
    await formRepository.upsertDetails(conn, id, prepared.details, now);

    if (prepared.touchedChoice) {
      await formRepository.replaceChoices(conn, id, prepared.choices, now);
    }
    for (const child of prepared.children) {
      await formRepository.replaceChildren(conn, child.table, id, child.rows, now);
    }
    if (prepared.consents.length > 0) {
      await formRepository.upsertConsents(conn, id, prepared.consents, now);
    }
  },

  /** 跨字段规则：志愿去重、导师必须属于所选 Program */
  async crossCheck(
    form: CompiledForm,
    values: FormValues,
    issues: ValidationIssue[],
    mode: 'save' | 'submit',
  ): Promise<void> {
    const firstProgram = values.programFirstId;
    const secondProgram = values.programSecondId;
    const firstSupervisor = toNumberOrNull(values.supervisorFirstId);
    const secondSupervisor = toNumberOrNull(values.supervisorSecondId);

    if (mode === 'submit' && !isNil(secondProgram) && isNil(firstProgram)) {
      issues.push({ path: 'values.programFirstId', code: 'required', message: '选择第二志愿前必须先选择第一志愿' });
    }
    if (!isNil(firstProgram) && !isNil(secondProgram) && String(firstProgram) === String(secondProgram)) {
      issues.push({ path: 'values.programSecondId', code: 'duplicate_program', message: '两个志愿不能是同一个 Program' });
    }
    if (firstSupervisor !== null && secondSupervisor !== null && firstSupervisor === secondSupervisor) {
      issues.push({
        path: 'values.supervisorSecondId',
        code: 'duplicate_supervisor',
        message: '两个志愿不能选择同一位导师',
      });
    }

    if (!isNil(firstProgram) && !form.programs.some((program) => program.value === String(firstProgram))) {
      issues.push({ path: 'values.programFirstId', code: 'invalid_option', message: '第一志愿 Program 不存在或已停用' });
    }
    if (!isNil(secondProgram) && !form.programs.some((program) => program.value === String(secondProgram))) {
      issues.push({ path: 'values.programSecondId', code: 'invalid_option', message: '第二志愿 Program 不存在或已停用' });
    }

    const ids = [firstSupervisor, secondSupervisor].filter((value): value is number => value !== null);
    if (ids.length === 0) return;

    const thrusts = await supervisorRepository.findThrustByIds(ids);

    const check = (supervisorId: number | null, program: unknown, path: string, label: string): void => {
      if (supervisorId === null) return;
      const thrust = thrusts.get(supervisorId);
      if (!thrust) {
        issues.push({ path, code: 'invalid_option', message: `${label}不存在或已停用` });
        return;
      }
      if (!isNil(program) && thrust !== String(program)) {
        issues.push({ path, code: 'supervisor_program_mismatch', message: `${label}不属于所选 Program` });
      }
    };

    check(firstSupervisor, firstProgram, 'values.supervisorFirstId', '第一志愿导师');
    check(secondSupervisor, secondProgram, 'values.supervisorSecondId', '第二志愿导师');
  },

  /**
   * 所有状态流转的统一入口：
   *   锁行 -> 归属/可见性 -> assertCan(动作, 角色, 当前状态) -> 提交前校验 -> 改状态 + 审计
   */
  async transition(
    auth: AuthContext,
    id: string,
    action: ApplicationAction,
    precheck?: (row: ApplicationRow, now: Date) => Promise<void>,
    options: { returnReason?: string | null; remark?: string | null } = {},
  ): Promise<ApplicationDetail> {
    const now = new Date();
    const form = await formConfigService.getCompiled();

    await withTransaction(async (conn) => {
      const row = await formRepository.lockById(conn, id);
      if (!row) throw notFound('申请不存在');

      if (auth.role === 'student') {
        assertOwnership(auth.userId, row.user_id);
      } else if (auth.role === 'supervisor') {
        const scope = await this.resolveScope(auth);
        const assigned = toNumberOrNull(row.reviewer_supervisor_id) === scope.supervisorId;
        if (!assigned || !isVisibleToSupervisor(row.status)) throw notFound('申请不存在');
      }

      assertCan(action, auth.role, row.status);
      if (precheck) await precheck(row, now);

      // Submit / Resubmit 校验的是「库里已保存的内容」，不是本次请求体
      if (action === 'submit' || action === 'resubmit') {
        const storedValues = await this.loadValues(id, form);
        const issues = await this.validateForSubmit(form, storedValues);
        if (issues.length > 0) throw validationError(issues);
      }

      const toStatus = nextStatus(action, row.status);
      const firstChoiceSupervisorId = await this.findFirstChoiceSupervisor(id);

      await formRepository.updateStatus(conn, id, {
        status: toStatus,
        now,
        submittedAt: action === 'submit' || action === 'resubmit' ? now : undefined,
        returnReason:
          action === 'return' ? (options.returnReason ?? '') : action === 'resubmit' ? null : undefined,
        reviewerSupervisorId:
          action === 'submit' || action === 'resubmit' ? firstChoiceSupervisorId : undefined,
      });

      await formRepository.insertLog(conn, {
        applicationId: id,
        action,
        fromStatus: row.status,
        toStatus,
        actorUserId: auth.userId,
        actorRole: auth.role,
        remark: options.remark ?? (action === 'return' ? (options.returnReason ?? null) : null),
        now,
      });
    });

    return this.getDetail(auth, id);
  },

  async findFirstChoiceSupervisor(id: string): Promise<number | null> {
    const choices = await formRepository.loadChoices(id);
    const first = choices.find((choice) => choice.choice_rank === 1);
    return toNumberOrNull(first?.supervisor_id ?? null);
  },

  /** Submit 侧完整校验：必填 + 类型 + 跨字段 */
  async validateForSubmit(form: CompiledForm, values: FormValues): Promise<ValidationIssue[]> {
    const scalarFields = form.enabledFields.filter((field) => {
      const section = form.sectionByCode.get(field.sectionCode);
      return section !== undefined && !section.isRepeatable && field.widget !== 'readonly';
    });

    const scalarRaw: Record<string, unknown> = {};
    for (const field of scalarFields) {
      if (hasOwn(values, field.code)) scalarRaw[field.code] = values[field.code];
    }

    const { issues } = validateScalarValues(scalarRaw, scalarFields, 'submit');
    await this.crossCheck(form, values, issues, 'submit');
    return issues;
  },
};
