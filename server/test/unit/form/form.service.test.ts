import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext, UserRole } from '@src/user/user.types';
import type {
  ApplicationListRow,
  ApplicationRow,
  StatusLogRow,
  SupervisorWithQuotaRow,
} from '@src/form/form.types';
import type { CompiledForm, FieldConfig, SectionConfig } from '@src/form/form.config.service';

vi.mock('@src/db/pool', () => ({
  withTransaction: vi.fn(),
  pool: { execute: vi.fn() },
}));
vi.mock('@src/form/form.config.service', () => ({
  formConfigService: {
    getCompiled: vi.fn(),
    getWindowState: vi.fn(),
    isSaveAllowed: vi.fn(),
    assertSaveAllowed: vi.fn(),
    assertSubmitAllowed: vi.fn(),
    invalidate: vi.fn(),
  },
}));
vi.mock('@src/form/form.repository', () => ({
  formRepository: {
    list: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findListRow: vi.fn(),
    findByUserId: vi.fn(),
    loadDetails: vi.fn(),
    loadChoices: vi.fn(),
    loadPublications: vi.fn(),
    loadExperiences: vi.fn(),
    loadConsents: vi.fn(),
    listLogs: vi.fn(),
    nextApplicationNumber: vi.fn(),
    insertApplication: vi.fn(),
    updateReviewer: vi.fn(),
    lockById: vi.fn(),
    updateStatus: vi.fn(),
    insertLog: vi.fn(),
    upsertDetails: vi.fn(),
    replaceChoices: vi.fn(),
    replaceChildren: vi.fn(),
    upsertConsents: vi.fn(),
    touch: vi.fn(),
  },
}));
vi.mock('@src/form/supervisor.repository', () => ({
  supervisorRepository: {
    findByUserId: vi.fn(),
    searchByProgram: vi.fn(),
    findThrustByIds: vi.fn(),
  },
}));
vi.mock('@src/form/form.quota', () => ({
  supervisorQuota: {
    acquire: vi.fn(),
    release: vi.fn(),
    transfer: vi.fn(),
  },
}));

import { formService } from '@src/form/form.service';
import { formConfigService } from '@src/form/form.config.service';
import { formRepository } from '@src/form/form.repository';
import { supervisorRepository } from '@src/form/supervisor.repository';
import { supervisorQuota } from '@src/form/form.quota';
import { withTransaction } from '@src/db/pool';
import { AppError } from '@src/common/errors';

const getCompiled = vi.mocked(formConfigService.getCompiled);
const getWindowState = vi.mocked(formConfigService.getWindowState);
const isSaveAllowed = vi.mocked(formConfigService.isSaveAllowed);
const assertSaveAllowed = vi.mocked(formConfigService.assertSaveAllowed);
const assertSubmitAllowed = vi.mocked(formConfigService.assertSubmitAllowed);

const repo = vi.mocked(formRepository);
const supervisors = vi.mocked(supervisorRepository);
const quota = vi.mocked(supervisorQuota);
const runTransaction = vi.mocked(withTransaction);

const field = (over: Record<string, unknown> & { code: string }): FieldConfig => {
  const base: Record<string, unknown> = {
    code: over.code,
    sectionCode: 'BASIC',
    groupCode: null,
    labelEn: over.code,
    labelZh: null,
    widget: 'input',
    valueType: 'string',
    isRequired: false,
    maxLength: null,
    optionsSource: null,
    dependsOnField: null,
    guideTextEn: null,
    storageTable: 'application_details',
    storageColumn: over.code,
    sortOrder: 0,
    options: [],
  };
  return { ...base, ...over } as unknown as FieldConfig;
};

const basicFields: FieldConfig[] = [
  field({ code: 'nameEn', isRequired: true, maxLength: 64, storageColumn: 'name_en' }),
  field({ code: 'email', widget: 'readonly', storageColumn: 'email' }),
  field({ code: 'programFirstId', storageColumn: null }),
  field({ code: 'programSecondId', storageColumn: null }),
  field({ code: 'supervisorFirstId', valueType: 'number', storageColumn: null }),
  field({ code: 'supervisorSecondId', valueType: 'number', storageColumn: null }),
  field({ code: 'consentDeclaration', valueType: 'boolean', storageColumn: null }),
];

const publicationFields: FieldConfig[] = [
  field({ code: 'title', sectionCode: 'PUBLICATIONS', storageColumn: 'title' }),
];

const section = (over: Record<string, unknown>): SectionConfig =>
  ({
    code: 'SECTION',
    titleEn: 'SECTION',
    titleZh: null,
    payloadKey: null,
    isRepeatable: false,
    isEnabled: true,
    sortOrder: 0,
    fields: [],
    ...over,
  }) as unknown as SectionConfig;

const basicSection = section({ code: 'BASIC', fields: basicFields });
const publicationsSection = section({
  code: 'PUBLICATIONS',
  titleEn: 'Publications',
  payloadKey: 'publications',
  isRepeatable: true,
  fields: publicationFields,
});

const compiled: CompiledForm = {
  sections: [basicSection, publicationsSection],
  enabledSections: [basicSection, publicationsSection],
  fields: [...basicFields, ...publicationFields],
  enabledFields: [...basicFields, ...publicationFields],
  fieldByCode: new Map([...basicFields, ...publicationFields].map((item) => [item.code, item])),
  sectionByCode: new Map([
    ['BASIC', basicSection],
    ['PUBLICATIONS', publicationsSection],
  ]),
  programs: [
    { value: 'AMAT', labelEn: 'Applied Math', labelZh: null },
    { value: 'CS', labelEn: 'Computer Science', labelZh: null },
  ],
  exams: [{ value: 'TOEFL', labelEn: 'TOEFL', labelZh: null }],
  statements: [
    { code: 'DECLARATION', version: 'v1', textEn: 'Declaration' },
    { code: 'MEDIA_CONSENT', version: 'v1', textEn: 'Media' },
    { code: 'UNRELATED', version: 'v1', textEn: 'N/A' },
  ],
};

const auth = (role: UserRole = 'student', over: Partial<AuthContext> = {}): AuthContext => ({
  userId: 'user-1',
  role,
  jti: 'jti-1',
  sessionId: 'session-1',
  amr: ['password'],
  expiresAt: 1_800_000_000,
  ...over,
});

const listRow = (over: Record<string, unknown> = {}): ApplicationListRow =>
  ({
    application_id: 'app-1',
    application_number: 'SC-2026-0001',
    status: 'Draft',
    status_changed_at: new Date('2026-03-01T00:00:00.000Z'),
    return_reason: null,
    reviewer_supervisor_id: 7,
    email: 'student@example.com',
    name_en: 'Alice',
    full_name_zh: null,
    first_program_code: 'AMAT',
    first_supervisor_name: 'Dr. A',
    second_program_code: null,
    second_supervisor_name: null,
    ...over,
  }) as unknown as ApplicationListRow;

const applicationRow = (over: Record<string, unknown> = {}): ApplicationRow =>
  ({
    id: 'app-1',
    application_number: 'SC-2026-0001',
    user_id: 'user-1',
    status: 'Draft',
    reviewer_supervisor_id: 7,
    quota_supervisor_id: null,
    submitted_at: null,
    status_changed_at: new Date('2026-03-01T00:00:00.000Z'),
    return_reason: null,
    created_at: new Date('2026-03-01T00:00:00.000Z'),
    updated_at: new Date('2026-03-01T00:00:00.000Z'),
    ...over,
  }) as unknown as ApplicationRow;

const logRow = (over: Record<string, unknown> = {}): StatusLogRow =>
  ({
    id: 1,
    action: 'save',
    from_status: null,
    to_status: 'Draft',
    actor_role: 'student',
    remark: null,
    created_at: new Date('2026-03-01T00:00:00.000Z'),
    ...over,
  }) as unknown as StatusLogRow;

const supervisorRow = (over: Record<string, unknown> = {}): SupervisorWithQuotaRow =>
  ({
    id: 7,
    user_emp_id: 'E007',
    name: 'Dr. A',
    name_zh: null,
    email: 'a@example.com',
    thrust_code: 'AMAT',
    dept_name_en: 'Math',
    is_active: 1,
    quota_capacity: 50,
    quota_used: 0,
    ...over,
  }) as unknown as SupervisorWithQuotaRow;

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  getCompiled.mockResolvedValue(compiled);
  getWindowState.mockResolvedValue({
    isOpen: true,
    opensAt: '2026-03-01T00:00:00.000Z',
    closesAt: '2026-03-31T00:00:00.000Z',
  });
  isSaveAllowed.mockResolvedValue(true);
  assertSaveAllowed.mockResolvedValue(undefined);
  assertSubmitAllowed.mockResolvedValue(undefined);

  repo.list.mockResolvedValue([listRow()]);
  repo.count.mockResolvedValue(1);
  repo.findById.mockResolvedValue(applicationRow());
  repo.findListRow.mockResolvedValue(listRow());
  repo.findByUserId.mockResolvedValue(null);
  repo.loadDetails.mockResolvedValue(null);
  repo.loadChoices.mockResolvedValue([]);
  repo.loadPublications.mockResolvedValue([]);
  repo.loadExperiences.mockResolvedValue([]);
  repo.loadConsents.mockResolvedValue([]);
  repo.listLogs.mockResolvedValue([logRow()]);
  repo.nextApplicationNumber.mockResolvedValue('SC-2026-0001');
  repo.insertApplication.mockResolvedValue(undefined);
  repo.updateReviewer.mockResolvedValue(undefined);
  repo.updateStatus.mockResolvedValue(undefined);
  repo.insertLog.mockResolvedValue(undefined);
  repo.upsertDetails.mockResolvedValue(undefined);
  repo.replaceChoices.mockResolvedValue(undefined);
  repo.replaceChildren.mockResolvedValue(undefined);
  repo.upsertConsents.mockResolvedValue(undefined);
  repo.touch.mockResolvedValue(undefined);
  // 每个用例默认能锁到一条 Draft 申请，需要别的状态时在用例里覆盖
  repo.lockById = vi.fn(async () => applicationRow());

  supervisors.findByUserId.mockResolvedValue(supervisorRow());
  supervisors.searchByProgram.mockResolvedValue([supervisorRow()]);
  supervisors.findThrustByIds.mockResolvedValue(new Map([[7, 'AMAT']]));

  quota.acquire.mockResolvedValue(undefined);
  quota.release.mockResolvedValue(undefined);
  quota.transfer.mockResolvedValue(undefined);

  runTransaction.mockImplementation(async (fn) => fn({} as never));
});

describe('formService.getSchema', () => {
  it('只下发启用的 section，并带上提交窗口与 canSaveDraft', async () => {
    const schema = await formService.getSchema();

    expect(schema.meta.canSaveDraft).toBe(true);
    expect(schema.meta.submissionWindow).toMatchObject({ isOpen: true });
    expect(schema.sections.map((item) => item.code)).toEqual(['BASIC', 'PUBLICATIONS']);
  });

  it('没有选项的字段不下发 options（避免前端渲染空下拉）', async () => {
    const schema = await formService.getSchema();
    const basic = schema.sections.find((item) => item.code === 'BASIC')!;
    expect(basic.fields.find((item) => item.code === 'nameEn')!.options).toBeUndefined();
  });

  it('只下发已知声明条款（DECLARATION / MEDIA_CONSENT），其余过滤', async () => {
    const schema = await formService.getSchema();
    expect(schema.statements).toEqual([
      { fieldCode: 'consentDeclaration', code: 'DECLARATION', version: 'v1', textEn: 'Declaration' },
      { fieldCode: 'consentMedia', code: 'MEDIA_CONSENT', version: 'v1', textEn: 'Media' },
    ]);
  });

  it('enums 暴露 programs / exams', async () => {
    const schema = await formService.getSchema();
    expect(schema.enums.programs).toHaveLength(2);
    expect(schema.enums.exams).toEqual([{ value: 'TOEFL', labelEn: 'TOEFL', labelZh: null }]);
  });
});

describe('formService.searchSupervisors', () => {
  it('未知 Program -> 400 invalid_option', async () => {
    await expect(formService.searchSupervisors('NOPE', undefined, 20)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_option',
    });
    expect(supervisors.searchByProgram).not.toHaveBeenCalled();
  });

  it('已知 Program -> 查询并映射成前端友好的字段名', async () => {
    const items = await formService.searchSupervisors('AMAT', 'dr', 10);

    expect(supervisors.searchByProgram).toHaveBeenCalledWith('AMAT', 'dr', 10);
    expect(items).toEqual([
      {
        id: 7,
        name: 'Dr. A',
        nameZh: null,
        userEmpId: 'E007',
        thrustCode: 'AMAT',
        deptNameEn: 'Math',
        remaining: 50,
        isFull: false,
      },
    ]);
  });

  it('名额用尽 -> remaining=0 / isFull=true（前端据此禁用选项）', async () => {
    supervisors.searchByProgram.mockResolvedValue([
      supervisorRow({ quota_capacity: 50, quota_used: 50 }),
    ]);

    const items = await formService.searchSupervisors('AMAT', undefined, 20);

    expect(items[0]).toMatchObject({ id: 7, remaining: 0, isFull: true });
  });
});

describe('formService.resolveScope', () => {
  it('学生/管理员不需要导师档案', async () => {
    await expect(formService.resolveScope(auth('student'))).resolves.toEqual({
      role: 'student',
      userId: 'user-1',
      supervisorId: null,
    });
    expect(supervisors.findByUserId).not.toHaveBeenCalled();
  });

  it('导师账号没绑定档案 -> 403 supervisor_not_registered（明确提示运维）', async () => {
    supervisors.findByUserId.mockResolvedValue(null);
    await expect(formService.resolveScope(auth('supervisor'))).rejects.toMatchObject({
      status: 403,
      details: { code: 'supervisor_not_registered' },
    });
  });

  it('导师已绑定 -> 带上 supervisors.id', async () => {
    await expect(formService.resolveScope(auth('supervisor'))).resolves.toEqual({
      role: 'supervisor',
      userId: 'user-1',
      supervisorId: 7,
    });
  });
});

describe('formService.list', () => {
  it('学生只能看到自己的申请（ownerUserId 收窄）', async () => {
    const result = await formService.list(auth('student'), { page: 1, pageSize: 20 });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: 'user-1', reviewerSupervisorId: null }),
      { page: 1, pageSize: 20 },
    );
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: 'app-1', displayStatus: 'Draft' });
  });

  it('管理员不加任何归属过滤', async () => {
    await formService.list(auth('admin'), { page: 1, pageSize: 20 });
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: null, reviewerSupervisorId: null, statuses: null }),
      expect.anything(),
    );
  });

  it('导师默认只看自己名下、且处于导师可见状态的申请', async () => {
    await formService.list(auth('supervisor'), { page: 1, pageSize: 20 });

    const filters = repo.list.mock.calls[0]![0];
    expect(filters.reviewerSupervisorId).toBe(7);
    expect(filters.statuses).toEqual([
      'PendingSupervisorReview',
      'SupervisorRecommended',
      'SupervisorRejected',
      'OfferSent',
      'OfferAccepted',
      'OfferDeclined',
    ]);
  });

  it('导师筛选了对自己不可见的状态 -> 直接返回空列表，不查库', async () => {
    const result = await formService.list(auth('supervisor'), {
      status: ['Draft'],
      page: 1,
      pageSize: 20,
    });

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(repo.list).not.toHaveBeenCalled();
  });

  it('导师筛选可见状态 -> 只保留可见的那部分', async () => {
    await formService.list(auth('supervisor'), {
      status: ['Draft', 'OfferSent'],
      page: 2,
      pageSize: 10,
    });
    expect(repo.list.mock.calls[0]![0].statuses).toEqual(['OfferSent']);
  });

  it('列表行的 status 与 displayStatus 分离（学生端折叠文案）', async () => {
    repo.list.mockResolvedValue([listRow({ status: 'PendingSupervisorReview' })]);
    const result = await formService.list(auth('student'), { page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ status: 'PendingSupervisorReview', displayStatus: 'Under Review' });
  });
});

describe('formService.getDetail', () => {
  it('申请不存在 -> 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(formService.getDetail(auth('student'), 'app-x')).rejects.toMatchObject({ status: 404 });
  });

  it('学生访问他人申请 -> 403 not_resource_owner（IDOR 防护）', async () => {
    repo.findById.mockResolvedValue(applicationRow({ user_id: 'someone-else' }));
    await expect(formService.getDetail(auth('student'), 'app-1')).rejects.toMatchObject({
      status: 403,
      details: { code: 'not_resource_owner' },
    });
  });

  it('导师访问未分配给自己的申请 -> 404（不暴露存在性）', async () => {
    repo.findById.mockResolvedValue(applicationRow({ reviewer_supervisor_id: 8 }));
    await expect(formService.getDetail(auth('supervisor'), 'app-1')).rejects.toMatchObject({ status: 404 });
  });

  it('导师访问已分配但还没进入导师审核的申请 -> 404', async () => {
    repo.findById.mockResolvedValue(
      applicationRow({ reviewer_supervisor_id: 7, status: 'PendingForPreliminaryScreening' }),
    );
    await expect(formService.getDetail(auth('supervisor'), 'app-1')).rejects.toMatchObject({ status: 404 });
  });

  it('学生草稿：可编辑、可保存/提交，并补上 readonly 的登录邮箱', async () => {
    const detail = await formService.getDetail(auth('student'), 'app-1');

    expect(detail.editable).toBe(true);
    expect(detail.actions).toEqual(expect.arrayContaining(['save', 'submit']));
    expect(detail.values.email).toBe('student@example.com');
    expect(detail.timeline).toHaveLength(1);
  });

  it('提交时间段关闭时草稿不可提交、也不可保存', async () => {
    getWindowState.mockResolvedValue({ isOpen: false, opensAt: null, closesAt: null });
    isSaveAllowed.mockResolvedValue(false);

    const detail = await formService.getDetail(auth('student'), 'app-1');

    expect(detail.editable).toBe(false);
    expect(detail.actions).not.toContain('submit');
    expect(detail.actions).not.toContain('save');
  });

  it('退回状态：可编辑、可 resubmit，但不可 submit', async () => {
    repo.findById.mockResolvedValue(applicationRow({ status: 'Returned', return_reason: '补材料' }));
    repo.findListRow.mockResolvedValue(listRow({ status: 'Returned', return_reason: '补材料' }));

    const detail = await formService.getDetail(auth('student'), 'app-1');

    expect(detail.editable).toBe(true);
    expect(detail.actions).toContain('resubmit');
    expect(detail.actions).not.toContain('submit');
    expect(detail.returnReason).toBe('补材料');
  });

  it('导师已分配且处于待审核：可 recommend / reject', async () => {
    repo.findById.mockResolvedValue(
      applicationRow({ reviewer_supervisor_id: 7, status: 'PendingSupervisorReview' }),
    );
    repo.findListRow.mockResolvedValue(
      listRow({ status: 'PendingSupervisorReview', displayStatus: 'Pending Supervisor Review' }),
    );

    const detail = await formService.getDetail(auth('supervisor'), 'app-1');

    expect(detail.editable).toBe(false);
    expect(detail.actions).toEqual(expect.arrayContaining(['recommend', 'reject']));
    expect(detail.actions).not.toContain('approve');
  });

  it('已保存的志愿 / 子表 / 声明会被组装成 values', async () => {
    repo.loadDetails.mockResolvedValue({ name_en: 'Alice' } as never);
    repo.loadChoices.mockResolvedValue([
      { id: 'c1', application_id: 'app-1', choice_rank: 1, program_code: 'AMAT', supervisor_id: 7 },
      { id: 'c2', application_id: 'app-1', choice_rank: 2, program_code: 'CS', supervisor_id: null },
    ] as never);
    repo.loadPublications.mockResolvedValue([{ id: 'p1', row_no: 1, title: 'Paper' }] as never);
    repo.loadConsents.mockResolvedValue([
      { application_id: 'app-1', statement_code: 'DECLARATION', statement_version: 'v1', agreed: 1, agreed_at: new Date() },
    ] as never);

    const detail = await formService.getDetail(auth('student'), 'app-1');

    expect(detail.values).toMatchObject({
      nameEn: 'Alice',
      programFirstId: 'AMAT',
      supervisorFirstId: 7,
      programSecondId: 'CS',
      consentDeclaration: true,
      publications: [{ title: 'Paper' }],
    });
  });
});

describe('formService.prepareSave（校验与拆分）', () => {
  it('未知字段 -> 400 validation_failed', async () => {
    await expect(formService.prepareSave(compiled, { hacker: 1 }, {})).rejects.toMatchObject({
      status: 400,
      code: 'validation_failed',
    });
  });

  it('两个志愿相同 -> duplicate_program', async () => {
    await expect(
      formService.prepareSave(compiled, { programFirstId: 'AMAT', programSecondId: 'AMAT' }, {}),
    ).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ code: 'duplicate_program' })]),
    });
  });

  it('两位导师相同 -> duplicate_supervisor', async () => {
    await expect(
      formService.prepareSave(compiled, { supervisorFirstId: '7', supervisorSecondId: '7' }, {}),
    ).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ code: 'duplicate_supervisor' })]),
    });
  });

  it('Program 不存在 -> invalid_option', async () => {
    await expect(
      formService.prepareSave(compiled, { programFirstId: 'NOPE' }, {}),
    ).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ code: 'invalid_option' })]),
    });
  });

  it('导师不属于所选 Program -> supervisor_program_mismatch', async () => {
    supervisors.findThrustByIds.mockResolvedValue(new Map([[7, 'CS']]));
    await expect(
      formService.prepareSave(compiled, { programFirstId: 'AMAT', supervisorFirstId: '7' }, {}),
    ).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ code: 'supervisor_program_mismatch' })]),
    });
  });

  it('导师不存在 -> invalid_option', async () => {
    supervisors.findThrustByIds.mockResolvedValue(new Map());
    await expect(
      formService.prepareSave(compiled, { programFirstId: 'AMAT', supervisorFirstId: '99' }, {}),
    ).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ code: 'invalid_option' })]),
    });
  });

  it('把标量拆成 application_details 列、志愿拆成 choices、声明拆成 consents', async () => {
    const prepared = await formService.prepareSave(
      compiled,
      {
        nameEn: ' Alice ',
        programFirstId: 'AMAT',
        supervisorFirstId: '7',
        consentDeclaration: true,
        publications: [{ title: 'Paper' }],
      },
      {},
    );

    expect(prepared.details).toEqual([['name_en', 'Alice']]);
    expect(prepared.choices).toEqual([{ rank: 1, programCode: 'AMAT', supervisorId: 7 }]);
    expect(prepared.consents).toEqual([{ code: 'DECLARATION', version: 'v1', agreed: true }]);
    expect(prepared.children).toEqual([
      { table: 'application_publications', rows: [{ title: 'Paper' }] },
    ]);
    expect(prepared.touchedChoice).toBe(true);
  });

  it('可重复小节不是数组 -> 400', async () => {
    await expect(
      formService.prepareSave(compiled, { publications: 'oops' }, {}),
    ).rejects.toMatchObject({ status: 400, code: 'validation_failed' });
  });

  it('save 模式不校验必填（草稿可以只存一半）', async () => {
    const prepared = await formService.prepareSave(compiled, {}, {});
    expect(prepared.details).toEqual([]);
    expect(prepared.choices).toEqual([]);
  });

  it('values 与已有值合并后再做跨字段校验（切换 Program 时旧导师会被检出）', async () => {
    supervisors.findThrustByIds.mockResolvedValue(new Map([[7, 'AMAT']]));
    // 已有值：第一个志愿选了 CS；本次只改导师为 7（AMAT 的导师）
    await expect(
      formService.prepareSave(
        compiled,
        { supervisorFirstId: '7' },
        { programFirstId: 'CS', supervisorFirstId: 7 },
      ),
    ).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ code: 'supervisor_program_mismatch' })]),
    });
  });
});

describe('formService.create', () => {
  it('该账号已有申请 -> 409 application_exists（前端据此跳编辑）', async () => {
    repo.findByUserId.mockResolvedValue(applicationRow());
    vi.spyOn(formService, 'getDetail').mockResolvedValue({} as never);

    await expect(formService.create(auth('student'), { nameEn: 'Alice' })).rejects.toMatchObject({
      status: 409,
      details: { code: 'application_exists', applicationId: 'app-1' },
    });
    expect(repo.insertApplication).not.toHaveBeenCalled();
  });

  it('首次保存：生成 Application No.、插入 Draft、写 save 日志', async () => {
    const detail = { id: 'app-new' } as never;
    const getDetailSpy = vi.spyOn(formService, 'getDetail').mockResolvedValue(detail);

    const result = await formService.create(auth('student'), {
      nameEn: 'Alice',
      programFirstId: 'AMAT',
      supervisorFirstId: '7',
    });

    expect(repo.nextApplicationNumber).toHaveBeenCalledWith(expect.anything(), expect.any(Date));
    expect(repo.insertApplication).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ applicationNumber: 'SC-2026-0001', userId: 'user-1' }),
    );
    expect(repo.upsertDetails).toHaveBeenCalledWith(expect.anything(), expect.any(String), [['name_en', 'Alice']], expect.any(Date));
    // First Choice 的导师同步成评审人
    expect(repo.updateReviewer).toHaveBeenCalledWith(expect.anything(), expect.any(String), 7, expect.any(Date));
    expect(repo.insertLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'save', fromStatus: null, toStatus: 'Draft' }),
    );
    expect(getDetailSpy).toHaveBeenCalled();
    expect(result).toBe(detail);
  });

  it('保存时段已结束 -> 409，且不进入事务', async () => {
    assertSaveAllowed.mockRejectedValue(
      new AppError(409, 'conflict', '申请提交时段已结束，无法继续保存', { code: 'submission_window_closed' }),
    );

    await expect(formService.create(auth('student'), {})).rejects.toMatchObject({ status: 409 });
    expect(runTransaction).not.toHaveBeenCalled();
  });
});

describe('formService.save', () => {
  it('别人的申请 -> 403', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ user_id: 'other' }));
    await expect(formService.save(auth('student'), 'app-1', {})).rejects.toMatchObject({ status: 403 });
  });

  it('状态不允许保存 -> 409', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'OfferSent' }));
    await expect(formService.save(auth('student'), 'app-1', {})).rejects.toMatchObject({
      status: 409,
      details: { code: 'invalid_transition' },
    });
  });

  it('草稿保存：写明细并 touch 更新时间', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow());
    vi.spyOn(formService, 'getDetail').mockResolvedValue({ id: 'app-1' } as never);

    await formService.save(auth('student'), 'app-1', { nameEn: 'Alice' });

    expect(repo.upsertDetails).toHaveBeenCalledWith(
      expect.anything(),
      'app-1',
      [['name_en', 'Alice']],
      expect.any(Date),
    );
    expect(repo.touch).toHaveBeenCalledWith(expect.anything(), 'app-1', expect.any(Date));
  });

  it('改了 First Choice 导师 -> 同步评审人并补一条日志', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ reviewer_supervisor_id: 3 }));
    vi.spyOn(formService, 'getDetail').mockResolvedValue({ id: 'app-1' } as never);

    await formService.save(auth('student'), 'app-1', {
      programFirstId: 'AMAT',
      supervisorFirstId: '7',
    });

    expect(repo.updateReviewer).toHaveBeenCalledWith(expect.anything(), 'app-1', 7, expect.any(Date));
    expect(repo.insertLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'save', remark: '变更 First Choice 导师，同步评审人' }),
    );
  });
});

describe('formService 状态流转', () => {
  const detailResult = { id: 'app-1', status: 'PendingForPreliminaryScreening' } as never;

  it('submit：Draft -> PendingForPreliminaryScreening，记录 submittedAt 与评审人', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'Draft' }));
    repo.loadChoices.mockResolvedValue([
      { id: 'c1', application_id: 'app-1', choice_rank: 1, program_code: 'AMAT', supervisor_id: 7 },
    ] as never);
    vi.spyOn(formService, 'loadValues').mockResolvedValue({ nameEn: 'Alice' });
    vi.spyOn(formService, 'validateForSubmit').mockResolvedValue([]);
    vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

    await formService.submit(auth('student'), 'app-1');

    expect(assertSubmitAllowed).toHaveBeenCalled();
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.anything(),
      'app-1',
      expect.objectContaining({
        status: 'PendingForPreliminaryScreening',
        submittedAt: expect.any(Date),
        reviewerSupervisorId: 7,
      }),
    );
    expect(repo.insertLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'submit', fromStatus: 'Draft', toStatus: 'PendingForPreliminaryScreening' }),
    );
  });

  it('submit：内容不完整 -> 400，状态不变', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'Draft' }));
    vi.spyOn(formService, 'loadValues').mockResolvedValue({});
    vi.spyOn(formService, 'validateForSubmit').mockResolvedValue([
      { path: 'values.nameEn', code: 'required', message: 'nameEn 为必填项' },
    ]);

    await expect(formService.submit(auth('student'), 'app-1')).rejects.toMatchObject({
      status: 400,
      code: 'validation_failed',
    });
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('submit：时间段关闭 -> 409', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'Draft' }));
    assertSubmitAllowed.mockRejectedValue(
      new AppError(409, 'conflict', '当前不在提交时间段内', { code: 'submission_window_closed' }),
    );
    vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

    await expect(formService.submit(auth('student'), 'app-1')).rejects.toMatchObject({ status: 409 });
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('resubmit：Returned -> PendingForPreliminaryScreening，且不占用提交时间段', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'Returned' }));
    repo.loadChoices.mockResolvedValue([] as never);
    vi.spyOn(formService, 'loadValues').mockResolvedValue({ nameEn: 'Alice' });
    vi.spyOn(formService, 'validateForSubmit').mockResolvedValue([]);
    vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

    await formService.resubmit(auth('student'), 'app-1');

    expect(assertSubmitAllowed).not.toHaveBeenCalled();
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.anything(),
      'app-1',
      expect.objectContaining({ status: 'PendingForPreliminaryScreening', returnReason: null }),
    );
  });

  it('approve：管理员把初筛通过 -> PendingSupervisorReview', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'PendingForPreliminaryScreening' }));
    vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

    await formService.approve(auth('admin'), 'app-1');

    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.anything(),
      'app-1',
      expect.objectContaining({ status: 'PendingSupervisorReview' }),
    );
    expect(repo.insertLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'approve', actorRole: 'admin' }),
    );
  });

  it('approve：学生调用 -> 403 role_forbidden', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'PendingForPreliminaryScreening' }));
    await expect(formService.approve(auth('student'), 'app-1')).rejects.toMatchObject({
      status: 403,
      details: expect.objectContaining({ code: 'role_forbidden' }),
    });
  });

  it('return：带回退原因，同时写进 status 与日志', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'PendingForPreliminaryScreening' }));
    vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

    await formService.returnToStudent(auth('admin'), 'app-1', '请补充成绩单');

    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.anything(),
      'app-1',
      expect.objectContaining({ status: 'Returned', returnReason: '请补充成绩单' }),
    );
    expect(repo.insertLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'return', remark: '请补充成绩单' }),
    );
  });

  it('recommend / reject：导师动作带上备注', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'PendingSupervisorReview' }));
    vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

    await formService.recommend(auth('supervisor'), 'app-1', ' 很优秀 ');
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.anything(),
      'app-1',
      expect.objectContaining({ status: 'SupervisorRecommended' }),
    );
    expect(repo.insertLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ remark: ' 很优秀 ' }),
    );

    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'PendingSupervisorReview' }));
    await formService.reject(auth('supervisor'), 'app-1');
    expect(repo.insertLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'reject' }),
    );
  });

  it('send_offer / accept_offer / decline_offer 的状态映射', async () => {
    vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'SupervisorRecommended' }));
    await formService.sendOffer(auth('admin'), 'app-1');
    expect(repo.updateStatus).toHaveBeenLastCalledWith(
      expect.anything(),
      'app-1',
      expect.objectContaining({ status: 'OfferSent' }),
    );

    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'OfferSent' }));
    await formService.acceptOffer(auth('student'), 'app-1');
    expect(repo.updateStatus).toHaveBeenLastCalledWith(
      expect.anything(),
      'app-1',
      expect.objectContaining({ status: 'OfferAccepted' }),
    );

    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'OfferSent' }));
    await formService.declineOffer(auth('student'), 'app-1');
    expect(repo.updateStatus).toHaveBeenLastCalledWith(
      expect.anything(),
      'app-1',
      expect.objectContaining({ status: 'OfferDeclined' }),
    );
  });

  it('导师操作未分配给自己的申请 -> 404', async () => {
    repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'PendingSupervisorReview', reviewer_supervisor_id: 8 }));
    await expect(formService.recommend(auth('supervisor'), 'app-1')).rejects.toMatchObject({ status: 404 });
  });

  describe('名额占位（需求 2.1）', () => {
    const firstChoice = (supervisorId: number) => [
      {
        id: `choice-${supervisorId}`,
        application_id: 'app-1',
        choice_rank: 1,
        program_code: 'AMAT',
        supervisor_id: supervisorId,
      },
    ];

    const submitAs = async (): Promise<void> => {
      vi.spyOn(formService, 'loadValues').mockResolvedValue({ nameEn: 'Alice' });
      vi.spyOn(formService, 'validateForSubmit').mockResolvedValue([]);
      vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);
      await formService.submit(auth('student'), 'app-1');
    };

    it('submit：在同一事务里占用名额，并写回 quotaSupervisorId', async () => {
      const conn = { name: 'tx-conn' };
      runTransaction.mockImplementation(async (fn) => fn(conn as never));
      repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'Draft' }));
      repo.loadChoices.mockResolvedValue(firstChoice(7) as never);

      await submitAs();

      expect(quota.transfer).toHaveBeenCalledWith(conn, null, 7, expect.any(Date));
      expect(repo.updateStatus).toHaveBeenCalledWith(
        conn,
        'app-1',
        expect.objectContaining({ quotaSupervisorId: 7 }),
      );
    });

    it('submit：名额已满 -> 409 quota_full，状态与日志都不写', async () => {
      repo.lockById = vi.fn().mockResolvedValue(applicationRow({ status: 'Draft' }));
      repo.loadChoices.mockResolvedValue(firstChoice(7) as never);
      quota.transfer.mockRejectedValue(
        new AppError(409, 'conflict', '名额已满', { code: 'quota_full', supervisorId: 7 }),
      );

      await expect(submitAs()).rejects.toMatchObject({
        status: 409,
        details: { code: 'quota_full' },
      });
      expect(repo.updateStatus).not.toHaveBeenCalled();
      expect(repo.insertLog).not.toHaveBeenCalled();
    });

    it('resubmit：导师未变 -> transfer 收到相同 id，不重复占用', async () => {
      repo.lockById = vi
        .fn()
        .mockResolvedValue(applicationRow({ status: 'Returned', quota_supervisor_id: 7 }));
      repo.loadChoices.mockResolvedValue(firstChoice(7) as never);
      vi.spyOn(formService, 'loadValues').mockResolvedValue({ nameEn: 'Alice' });
      vi.spyOn(formService, 'validateForSubmit').mockResolvedValue([]);
      vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

      await formService.resubmit(auth('student'), 'app-1');

      expect(quota.transfer).toHaveBeenCalledWith(expect.anything(), 7, 7, expect.any(Date));
      expect(repo.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'app-1',
        expect.objectContaining({ quotaSupervisorId: 7 }),
      );
    });

    it('resubmit：换导师 -> 同一事务内从旧导师迁移到新导师', async () => {
      repo.lockById = vi
        .fn()
        .mockResolvedValue(applicationRow({ status: 'Returned', quota_supervisor_id: 5 }));
      repo.loadChoices.mockResolvedValue(firstChoice(7) as never);
      vi.spyOn(formService, 'loadValues').mockResolvedValue({ nameEn: 'Alice' });
      vi.spyOn(formService, 'validateForSubmit').mockResolvedValue([]);
      vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

      await formService.resubmit(auth('student'), 'app-1');

      expect(quota.transfer).toHaveBeenCalledWith(expect.anything(), 5, 7, expect.any(Date));
      expect(repo.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'app-1',
        expect.objectContaining({ quotaSupervisorId: 7 }),
      );
    });

    it('Supervisor Reject：释放名额并把 quotaSupervisorId 置空', async () => {
      repo.lockById = vi.fn().mockResolvedValue(
        applicationRow({ status: 'PendingSupervisorReview', quota_supervisor_id: 7 }),
      );
      vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

      await formService.reject(auth('supervisor'), 'app-1');

      expect(quota.release).toHaveBeenCalledWith(expect.anything(), 7, expect.any(Date));
      expect(repo.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'app-1',
        expect.objectContaining({ quotaSupervisorId: null }),
      );
    });

    it('学生 Decline Offer：释放名额', async () => {
      repo.lockById = vi.fn().mockResolvedValue(
        applicationRow({ status: 'OfferSent', quota_supervisor_id: 7 }),
      );
      vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

      await formService.declineOffer(auth('student'), 'app-1');

      expect(quota.release).toHaveBeenCalledWith(expect.anything(), 7, expect.any(Date));
      expect(repo.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'app-1',
        expect.objectContaining({ quotaSupervisorId: null }),
      );
    });

    it('学生 Accept Offer：名额转为最终占用，不释放', async () => {
      repo.lockById = vi.fn().mockResolvedValue(
        applicationRow({ status: 'OfferSent', quota_supervisor_id: 7 }),
      );
      vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

      await formService.acceptOffer(auth('student'), 'app-1');

      expect(quota.release).not.toHaveBeenCalled();
      expect(quota.transfer).not.toHaveBeenCalled();
      const input = repo.updateStatus.mock.calls.at(-1)?.[2] as { quotaSupervisorId?: unknown };
      expect(input.quotaSupervisorId).toBeUndefined();
    });

    it('初筛通过 / Send Offer 等中间动作不动名额', async () => {
      repo.lockById = vi.fn().mockResolvedValue(
        applicationRow({ status: 'PendingForPreliminaryScreening', quota_supervisor_id: 7 }),
      );
      vi.spyOn(formService, 'getDetail').mockResolvedValue(detailResult);

      await formService.approve(auth('admin'), 'app-1');

      expect(quota.acquire).not.toHaveBeenCalled();
      expect(quota.release).not.toHaveBeenCalled();
      expect(quota.transfer).not.toHaveBeenCalled();
    });
  });
});

describe('formService.validateForSubmit', () => {
  it('必填缺失 -> required issues', async () => {
    const issues = await formService.validateForSubmit(compiled, {});
    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'values.nameEn', code: 'required' })]),
    );
  });

  it('只校验「会被保存」的字段（readonly 登录邮箱不参与必填）', async () => {
    const issues = await formService.validateForSubmit(compiled, { nameEn: 'Alice' });
    expect(issues.some((issue) => issue.path.includes('email'))).toBe(false);
  });

  it('校验通过 -> 无 issues', async () => {
    const issues = await formService.validateForSubmit(compiled, { nameEn: 'Alice' });
    expect(issues).toEqual([]);
  });
});

describe('formService.sendOfferBatch', () => {
  it('去重后逐条处理，成功/失败分别计数', async () => {
    const sendOffer = vi
      .spyOn(formService, 'sendOffer')
      .mockResolvedValueOnce({ id: 'a' } as never)
      .mockRejectedValueOnce(
        new AppError(409, 'conflict', '当前状态不允许该操作', { code: 'invalid_transition' }),
      );

    const result = await formService.sendOfferBatch(auth('admin'), ['a', 'a', 'b']);

    expect(sendOffer).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ total: 2, successCount: 1, failureCount: 1 });
    expect(result.failures).toEqual([
      expect.objectContaining({ id: 'b', code: 'invalid_transition', applicationNumber: 'SC-2026-0001' }),
    ]);
  });

  it('非 AppError 失败归一成 internal_error，不泄露内部信息', async () => {
    vi.spyOn(formService, 'sendOffer').mockRejectedValue(new Error('db exploded'));

    const result = await formService.sendOfferBatch(auth('admin'), ['a']);

    expect(result.failures[0]).toMatchObject({ code: 'internal_error', message: '服务器内部错误' });
    expect(JSON.stringify(result)).not.toContain('db exploded');
  });

  it('失败项查不到申请时 applicationNumber 为 null', async () => {
    vi.spyOn(formService, 'sendOffer').mockRejectedValue(new AppError(404, 'not_found', '申请不存在'));
    repo.findById.mockResolvedValue(null);

    const result = await formService.sendOfferBatch(auth('admin'), ['a']);

    expect(result.failures[0]).toMatchObject({ applicationNumber: null, code: 'not_found' });
  });

  it('单条超过 3 秒视为超时失败，其余继续', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(formService, 'sendOffer').mockImplementation(
        () => new Promise(() => undefined) as never,
      );

      const promise = formService.sendOfferBatch(auth('admin'), ['slow']);
      await vi.advanceTimersByTimeAsync(3_500);
      const result = await promise;

      expect(result).toMatchObject({ total: 1, successCount: 0, failureCount: 1 });
      expect(result.failures[0]).toMatchObject({ code: 'timeout', message: '处理超时，请稍后重试' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('formService.history / mine', () => {
  it('history 复用 getDetail 的 timeline', async () => {
    vi.spyOn(formService, 'getDetail').mockResolvedValue({
      id: 'app-1',
      timeline: [{ action: 'save', fromStatus: null, toStatus: 'Draft', actorRole: 'student', remark: null, at: '2026-03-01T00:00:00.000Z' }],
    } as never);

    await expect(formService.history(auth('student'), 'app-1')).resolves.toEqual({
      applicationId: 'app-1',
      timeline: [
        expect.objectContaining({ action: 'save', toStatus: 'Draft' }),
      ],
    });
  });

  it('mine：没有申请时返回 null', async () => {
    repo.findByUserId.mockResolvedValue(null);
    await expect(formService.mine(auth('student'))).resolves.toBeNull();
  });

  it('mine：有申请时返回详情', async () => {
    repo.findByUserId.mockResolvedValue(applicationRow());
    vi.spyOn(formService, 'getDetail').mockResolvedValue({ id: 'app-1' } as never);

    await expect(formService.mine(auth('student'))).resolves.toEqual({ id: 'app-1' });
  });
});
