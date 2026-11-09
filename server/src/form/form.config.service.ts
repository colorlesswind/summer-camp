import { assertSubmissionWindowOpen } from './application.state';
import { conflict } from '../common/errors';
import { formConfigRepository } from './form.config.repository';
import type { ExamRow, FieldRow, OptionRow, ProgramRow, SectionRow, StatementDefinitionRow } from './form.types';

export type ValueType = 'string' | 'number' | 'boolean' | 'date';

export interface FieldOptionConfig {
  value: string;
  labelEn: string;
  labelZh: string | null;
}

export interface FieldConfig {
  code: string;
  sectionCode: string;
  groupCode: string | null;
  labelEn: string;
  labelZh: string | null;
  widget: string;
  valueType: ValueType;
  isRequired: boolean;
  maxLength: number | null;
  optionsSource: string | null;
  dependsOnField: string | null;
  guideTextEn: string | null;
  storageTable: string | null;
  storageColumn: string | null;
  sortOrder: number;
  options: FieldOptionConfig[];
}

export interface SectionConfig {
  code: string;
  titleEn: string;
  titleZh: string | null;
  payloadKey: string | null;
  isRepeatable: boolean;
  isEnabled: boolean;
  sortOrder: number;
  fields: FieldConfig[];
}

/** Statement 条款原文。fieldCode 是表单里对应的 checkbox 字段（consentDeclaration / consentMedia） */
export interface StatementConfig {
  code: string;
  version: string;
  textEn: string;
}

export interface CompiledForm {
  sections: SectionConfig[];
  enabledSections: SectionConfig[];
  fields: FieldConfig[];
  enabledFields: FieldConfig[];
  fieldByCode: Map<string, FieldConfig>;
  sectionByCode: Map<string, SectionConfig>;
  programs: FieldOptionConfig[];
  exams: FieldOptionConfig[];
  statements: StatementConfig[];
}

export interface SubmissionWindowState {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

const CACHE_TTL_MS = 30_000;

let cached: { form: CompiledForm; builtAt: number } | null = null;

const toValueType = (raw: string): ValueType => {
  if (raw === 'number' || raw === 'boolean' || raw === 'date') return raw;
  return 'string';
};

const buildForm = (
  sectionRows: SectionRow[],
  fieldRows: FieldRow[],
  optionRows: OptionRow[],
  programRows: ProgramRow[],
  examRows: ExamRow[],
  statementRows: StatementDefinitionRow[],
): CompiledForm => {
  const programs: FieldOptionConfig[] = programRows.map((row) => ({
    value: row.code,
    labelEn: row.name_en,
    labelZh: null,
  }));
  const exams: FieldOptionConfig[] = examRows.map((row) => ({
    value: row.code,
    labelEn: row.label_en,
    labelZh: null,
  }));

  const optionsByField = new Map<string, FieldOptionConfig[]>();
  for (const row of optionRows) {
    const list = optionsByField.get(row.field_code) ?? [];
    list.push({ value: row.value, labelEn: row.label_en, labelZh: row.label_zh });
    optionsByField.set(row.field_code, list);
  }

  const fields: FieldConfig[] = fieldRows.map((row) => {
    const source = row.options_source;
    let options: FieldOptionConfig[] = [];
    if (source === 'static' || source === null) {
      options = optionsByField.get(row.code) ?? [];
    } else if (source === 'programs') {
      options = programs;
    } else if (source === 'exams') {
      options = exams;
    }
    // supervisors_by_thrust 的候选依赖所选 Program，由 /form/supervisors 接口提供

    return {
      code: row.code,
      sectionCode: row.section_code,
      groupCode: row.group_code,
      labelEn: row.label_en,
      labelZh: row.label_zh,
      widget: row.widget,
      valueType: toValueType(row.value_type),
      isRequired: Boolean(row.is_required),
      maxLength: row.max_length,
      optionsSource: source,
      dependsOnField: row.depends_on_field,
      guideTextEn: row.guide_text_en,
      storageTable: row.storage_table,
      storageColumn: row.storage_column,
      sortOrder: row.sort_order,
      options,
    };
  });

  const fieldByCode = new Map(fields.map((field) => [field.code, field]));

  const statements: StatementConfig[] = statementRows.map((row) => ({
    code: row.code,
    version: row.version,
    textEn: row.text_en,
  }));

  const sections: SectionConfig[] = sectionRows.map((row) => ({
    code: row.code,
    titleEn: row.title_en,
    titleZh: row.title_zh,
    payloadKey: row.payload_key,
    isRepeatable: Boolean(row.is_repeatable),
    isEnabled: Boolean(row.is_enabled),
    sortOrder: row.sort_order,
    fields: fields
      .filter((field) => field.sectionCode === row.code)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  return {
    sections,
    enabledSections: sections.filter((section) => section.isEnabled),
    fields,
    enabledFields: fields.filter((field) => {
      const section = sections.find((item) => item.code === field.sectionCode);
      return section?.isEnabled === true;
    }),
    fieldByCode,
    sectionByCode: new Map(sections.map((section) => [section.code, section])),
    programs,
    exams,
    statements,
  };
};

/**
 * 表单配置服务。
 *
 * 配置是「读多写极少」的数据，这里做 30 秒进程内缓存；
 * 改了 form_fields 想立刻生效？重启进程或等 30 秒，管理端不涉及高频变更。
 * 注意：提交时间段不能缓存，每次实时查库。
 */
export const formConfigService = {
  async getCompiled(force = false): Promise<CompiledForm> {
    if (!force && cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
      return cached.form;
    }

    const [sectionRows, fieldRows, optionRows, programRows, examRows, statementRows] = await Promise.all([
      formConfigRepository.listSections(),
      formConfigRepository.listFields(),
      formConfigRepository.listOptions(),
      formConfigRepository.listPrograms(),
      formConfigRepository.listExams(),
      formConfigRepository.listStatements(),
    ]);

    const form = buildForm(sectionRows, fieldRows, optionRows, programRows, examRows, statementRows);
    cached = { form, builtAt: Date.now() };
    return form;
  },

  invalidate(): void {
    cached = null;
  },

  /** 当前提交窗口状态：开放中返回当前窗口，否则返回下一个即将开放的窗口 */
  async getWindowState(now: Date): Promise<SubmissionWindowState> {
    const windows = await formConfigRepository.listOpenWindows(now);
    const current = windows.find((row) => now >= row.opens_at && now <= row.closes_at);
    const upcoming = windows.find((row) => row.opens_at > now);
    const target = current ?? upcoming ?? null;

    return {
      isOpen: current !== undefined,
      opensAt: target ? target.opens_at.toISOString() : null,
      closesAt: target ? target.closes_at.toISOString() : null,
    };
  },

  /**
   * Draft 草稿是否还能保存。
   * 规则（笔试题 2.1）：提交开始前可提前保存；提交时段内可保存；时段结束（且窗口都过期）后不可保存。
   */
  async isSaveAllowed(now: Date): Promise<boolean> {
    const windows = await formConfigRepository.listOpenWindows(now);
    if (windows.length > 0) return true;
    // 一个窗口都没配过 -> 视为不限制，避免本地开发被卡死
    return (await formConfigRepository.countAllWindows()) === 0;
  },

  async assertSaveAllowed(now: Date): Promise<void> {
    if (await this.isSaveAllowed(now)) return;
    throw conflict('申请提交时段已结束，无法继续保存', { code: 'submission_window_closed' });
  },

  /** Submit 专用：窗口外直接 409（Resubmit 不调用） */
  async assertSubmitAllowed(now: Date): Promise<void> {
    const windows = await formConfigRepository.listOpenWindows(now);
    if (windows.length === 0 && (await formConfigRepository.countAllWindows()) === 0) return;

    assertSubmissionWindowOpen(
      now,
      windows.map((row) => ({ opensAt: row.opens_at, closesAt: row.closes_at })),
    );
  },
};
