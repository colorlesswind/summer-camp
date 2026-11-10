import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExamRow,
  FieldRow,
  OptionRow,
  ProgramRow,
  SectionRow,
  StatementDefinitionRow,
  SubmissionWindowRow,
} from '@src/form/form.types';

vi.mock('@src/form/form.config.repository', () => ({
  formConfigRepository: {
    listSections: vi.fn(),
    listFields: vi.fn(),
    listOptions: vi.fn(),
    listPrograms: vi.fn(),
    listExams: vi.fn(),
    listStatements: vi.fn(),
    listOpenWindows: vi.fn(),
    countAllWindows: vi.fn(),
  },
}));

import { formConfigService } from '@src/form/form.config.service';
import { formConfigRepository } from '@src/form/form.config.repository';

const listSections = vi.mocked(formConfigRepository.listSections);
const listFields = vi.mocked(formConfigRepository.listFields);
const listOptions = vi.mocked(formConfigRepository.listOptions);
const listPrograms = vi.mocked(formConfigRepository.listPrograms);
const listExams = vi.mocked(formConfigRepository.listExams);
const listStatements = vi.mocked(formConfigRepository.listStatements);
const listOpenWindows = vi.mocked(formConfigRepository.listOpenWindows);
const countAllWindows = vi.mocked(formConfigRepository.countAllWindows);

const sectionRow = (over: Record<string, unknown>): SectionRow =>
  ({
    code: 'SECTION',
    title_en: 'SECTION',
    title_zh: null,
    payload_key: null,
    is_repeatable: 0,
    is_enabled: 1,
    sort_order: 0,
    ...over,
  }) as unknown as SectionRow;

const fieldRow = (over: Record<string, unknown>): FieldRow =>
  ({
    code: 'FIELD',
    section_code: 'BASIC',
    group_code: null,
    label_en: 'FIELD',
    label_zh: null,
    widget: 'input',
    value_type: 'string',
    is_required: 0,
    max_length: null,
    options_source: null,
    depends_on_field: null,
    guide_text_en: null,
    storage_table: 'application_details',
    storage_column: 'FIELD',
    sort_order: 0,
    is_enabled: 1,
    ...over,
  }) as unknown as FieldRow;

const windowRow = (id: string, opensAt: Date, closesAt: Date): SubmissionWindowRow =>
  ({ id, label: id, opens_at: opensAt, closes_at: closesAt }) as SubmissionWindowRow;

const seedConfig = (): void => {
  listSections.mockResolvedValue([
    sectionRow({ code: 'BASIC', sort_order: 1 }),
    sectionRow({ code: 'DISABLED', sort_order: 2, is_enabled: 0 }),
  ]);
  listFields.mockResolvedValue([
    fieldRow({ code: 'nameEn', sort_order: 2, is_required: 1, max_length: 64 }),
    fieldRow({ code: 'programFirstId', sort_order: 1, options_source: 'programs' }),
    fieldRow({ code: 'examCode', options_source: 'exams' }),
    fieldRow({ code: 'consentDeclaration', options_source: 'static' }),
    fieldRow({ code: 'hiddenField', section_code: 'DISABLED' }),
    fieldRow({ code: 'score', value_type: 'number' }),
  ]);
  listOptions.mockResolvedValue([
    { field_code: 'consentDeclaration', value: 'yes', label_en: 'Yes', label_zh: '是', sort_order: 1 } as OptionRow,
  ]);
  listPrograms.mockResolvedValue([
    { code: 'AMAT', name_en: 'Applied Math', thrust_name_en: 'T', sort_order: 1 } as ProgramRow,
  ]);
  listExams.mockResolvedValue([{ code: 'TOEFL', label_en: 'TOEFL', sort_order: 1 } as ExamRow]);
  listStatements.mockResolvedValue([
    {
      code: 'DECLARATION',
      version: 'v1',
      text_en: 'Declaration',
      text_zh: null,
      effective_from: new Date('2026-01-01'),
    } as StatementDefinitionRow,
  ]);

  listOpenWindows.mockResolvedValue([]);
  countAllWindows.mockResolvedValue(0);
};

beforeEach(() => {
  vi.clearAllMocks();
  formConfigService.invalidate();
  seedConfig();
});

describe('getCompiled - 组装规则', () => {
  it('字段按 section 归属并按 sortOrder 排序', async () => {
    const form = await formConfigService.getCompiled();
    const basic = form.sectionByCode.get('BASIC')!;
    expect(basic.fields.map((field) => field.code)).toEqual([
      'examCode',
      'consentDeclaration',
      'score',
      'programFirstId',
      'nameEn',
    ]);
  });

  it('options_source 决定选项来源：programs / exams / static', async () => {
    const form = await formConfigService.getCompiled();
    expect(form.fieldByCode.get('programFirstId')!.options).toEqual([
      { value: 'AMAT', labelEn: 'Applied Math', labelZh: null },
    ]);
    expect(form.fieldByCode.get('examCode')!.options).toEqual([
      { value: 'TOEFL', labelEn: 'TOEFL', labelZh: null },
    ]);
    expect(form.fieldByCode.get('consentDeclaration')!.options).toEqual([
      { value: 'yes', labelEn: 'Yes', labelZh: '是' },
    ]);
  });

  it('未知 value_type 回退成 string（配置写错也不能让整张表崩）', async () => {
    listFields.mockResolvedValue([fieldRow({ code: 'weird', value_type: 'json' })]);
    const form = await formConfigService.getCompiled();
    expect(form.fieldByCode.get('weird')!.valueType).toBe('string');
  });

  it('enabledSections / enabledFields 只含启用的配置', async () => {
    const form = await formConfigService.getCompiled();
    expect(form.enabledSections.map((section) => section.code)).toEqual(['BASIC']);
    expect(form.enabledFields.map((field) => field.code)).not.toContain('hiddenField');
    // 禁用 section 里的字段仍在 fields 里（管理端可能需要），但不在 enabledFields
    expect(form.fields.map((field) => field.code)).toContain('hiddenField');
  });

  it('programs / exams / statements 独立暴露给前端', async () => {
    const form = await formConfigService.getCompiled();
    expect(form.programs).toEqual([{ value: 'AMAT', labelEn: 'Applied Math', labelZh: null }]);
    expect(form.exams.map((exam) => exam.value)).toEqual(['TOEFL']);
    expect(form.statements).toEqual([{ code: 'DECLARATION', version: 'v1', textEn: 'Declaration' }]);
  });

  it('缓存 30 秒：连续调用不重复查库，force / invalidate 会失效', async () => {
    await formConfigService.getCompiled();
    await formConfigService.getCompiled();
    expect(listSections).toHaveBeenCalledTimes(1);

    await formConfigService.getCompiled(true);
    expect(listSections).toHaveBeenCalledTimes(2);

    formConfigService.invalidate();
    await formConfigService.getCompiled();
    expect(listSections).toHaveBeenCalledTimes(3);
  });

  it('六个配置查询全部被调用（一次拿齐整张表单配置）', async () => {
    await formConfigService.getCompiled();
    expect(listSections).toHaveBeenCalledTimes(1);
    expect(listFields).toHaveBeenCalledTimes(1);
    expect(listOptions).toHaveBeenCalledTimes(1);
    expect(listPrograms).toHaveBeenCalledTimes(1);
    expect(listExams).toHaveBeenCalledTimes(1);
    expect(listStatements).toHaveBeenCalledTimes(1);
  });
});

describe('getWindowState', () => {
  const now = new Date('2026-03-15T12:00:00.000Z');

  it('当前窗口开放 -> isOpen=true，并返回当前窗口', async () => {
    listOpenWindows.mockResolvedValue([
      windowRow('current', new Date('2026-03-01T00:00:00.000Z'), new Date('2026-03-31T00:00:00.000Z')),
    ]);

    await expect(formConfigService.getWindowState(now)).resolves.toEqual({
      isOpen: true,
      opensAt: '2026-03-01T00:00:00.000Z',
      closesAt: '2026-03-31T00:00:00.000Z',
    });
  });

  it('还没开放 -> isOpen=false，返回下一个即将开放的窗口', async () => {
    listOpenWindows.mockResolvedValue([
      windowRow('upcoming', new Date('2026-04-01T00:00:00.000Z'), new Date('2026-04-30T00:00:00.000Z')),
    ]);

    await expect(formConfigService.getWindowState(now)).resolves.toEqual({
      isOpen: false,
      opensAt: '2026-04-01T00:00:00.000Z',
      closesAt: '2026-04-30T00:00:00.000Z',
    });
  });

  it('当前与未来窗口同时存在 -> 优先当前', async () => {
    listOpenWindows.mockResolvedValue([
      windowRow('current', new Date('2026-03-01T00:00:00.000Z'), new Date('2026-03-31T00:00:00.000Z')),
      windowRow('upcoming', new Date('2026-04-01T00:00:00.000Z'), new Date('2026-04-30T00:00:00.000Z')),
    ]);

    const state = await formConfigService.getWindowState(now);
    expect(state.isOpen).toBe(true);
    expect(state.opensAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('一个窗口都没有 -> 全 null', async () => {
    listOpenWindows.mockResolvedValue([]);
    await expect(formConfigService.getWindowState(now)).resolves.toEqual({
      isOpen: false,
      opensAt: null,
      closesAt: null,
    });
  });
});

describe('isSaveAllowed / assertSaveAllowed', () => {
  const now = new Date('2026-03-15T12:00:00.000Z');

  it('有未结束的窗口 -> 允许保存', async () => {
    listOpenWindows.mockResolvedValue([windowRow('w', now, now)]);
    await expect(formConfigService.isSaveAllowed(now)).resolves.toBe(true);
    expect(countAllWindows).not.toHaveBeenCalled();
  });

  it('没有任何窗口但也没配置过（总数 0）-> 允许（本地开发不被卡死）', async () => {
    listOpenWindows.mockResolvedValue([]);
    countAllWindows.mockResolvedValue(0);
    await expect(formConfigService.isSaveAllowed(now)).resolves.toBe(true);
  });

  it('窗口全部结束且配置过 -> 不允许保存', async () => {
    listOpenWindows.mockResolvedValue([]);
    countAllWindows.mockResolvedValue(2);
    await expect(formConfigService.isSaveAllowed(now)).resolves.toBe(false);
  });

  it('assertSaveAllowed 不允许时抛 409 submission_window_closed', async () => {
    listOpenWindows.mockResolvedValue([]);
    countAllWindows.mockResolvedValue(1);

    await expect(formConfigService.assertSaveAllowed(now)).rejects.toMatchObject({
      status: 409,
      details: { code: 'submission_window_closed' },
    });
  });

  it('assertSaveAllowed 允许时 resolve', async () => {
    listOpenWindows.mockResolvedValue([windowRow('w', now, now)]);
    await expect(formConfigService.assertSaveAllowed(now)).resolves.toBeUndefined();
  });
});

describe('assertSubmitAllowed', () => {
  const now = new Date('2026-03-15T12:00:00.000Z');

  it('从未配置窗口 -> 放行', async () => {
    listOpenWindows.mockResolvedValue([]);
    countAllWindows.mockResolvedValue(0);
    await expect(formConfigService.assertSubmitAllowed(now)).resolves.toBeUndefined();
  });

  it('配置过但当前没有开放窗口 -> 409', async () => {
    listOpenWindows.mockResolvedValue([]);
    countAllWindows.mockResolvedValue(1);
    await expect(formConfigService.assertSubmitAllowed(now)).rejects.toMatchObject({
      status: 409,
      details: { code: 'submission_window_closed' },
    });
  });

  it('窗口开放中 -> 放行', async () => {
    listOpenWindows.mockResolvedValue([
      windowRow('w', new Date('2026-03-01T00:00:00.000Z'), new Date('2026-03-31T00:00:00.000Z')),
    ]);
    await expect(formConfigService.assertSubmitAllowed(now)).resolves.toBeUndefined();
  });

  it('查到的窗口不含 now（例如库里时间有偏差）-> 409', async () => {
    listOpenWindows.mockResolvedValue([
      windowRow('w', new Date('2026-05-01T00:00:00.000Z'), new Date('2026-05-31T00:00:00.000Z')),
    ]);
    await expect(formConfigService.assertSubmitAllowed(now)).rejects.toMatchObject({ status: 409 });
  });
});
