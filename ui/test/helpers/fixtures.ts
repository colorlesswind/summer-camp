import type {
  ApplicationDetail,
  ApplicationSummary,
  FormFieldConfig,
  FormSchema,
  FormSectionConfig,
  SupervisorOption,
  TimelineEntry,
} from '@/types/application';
import type { UserProfile } from '@/types/user';

/** 测试用的 schema/申请数据工厂：只填被测代码关心的字段，其余给安全默认值。 */

let fieldSeq = 0;

export function makeField(overrides: Partial<FormFieldConfig> = {}): FormFieldConfig {
  fieldSeq += 1;
  const code = overrides.code ?? `field_${fieldSeq}`;
  return {
    code,
    sectionCode: 'PERSONAL',
    groupCode: null,
    labelEn: code,
    labelZh: null,
    widget: 'free_text',
    valueType: 'string',
    isRequired: false,
    maxLength: null,
    optionsSource: null,
    dependsOnField: null,
    guideTextEn: null,
    options: undefined,
    ...overrides,
  };
}

export function makeSection(overrides: Partial<FormSectionConfig> = {}): FormSectionConfig {
  return {
    code: 'PERSONAL',
    titleEn: 'Personal Information',
    titleZh: null,
    payloadKey: null,
    isRepeatable: false,
    sortOrder: 1,
    fields: [],
    ...overrides,
  };
}

export interface SchemaOverrides {
  sections?: FormSectionConfig[];
  canSaveDraft?: boolean;
  isOpen?: boolean;
  programs?: FormSchema['enums']['programs'];
  statements?: FormSchema['statements'];
}

export function makeSchema(overrides: SchemaOverrides = {}): FormSchema {
  return {
    meta: {
      serverTime: '2026-01-01T00:00:00.000Z',
      submissionWindow: {
        isOpen: overrides.isOpen ?? true,
        opensAt: '2026-01-01T00:00:00.000Z',
        closesAt: '2026-12-31T00:00:00.000Z',
      },
      canSaveDraft: overrides.canSaveDraft ?? true,
    },
    sections: overrides.sections ?? [],
    statements: overrides.statements ?? [],
    enums: {
      programs: overrides.programs ?? [
        { value: 'P1', labelEn: 'Program One' },
        { value: 'P2', labelEn: 'Program Two' },
      ],
      exams: [],
    },
  };
}

export function makeSummary(overrides: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: 'app-1',
    applicationNumber: 'SC-2026-0001',
    nameEn: 'Alice Chan',
    fullNameZh: null,
    email: 'alice@example.com',
    status: 'PendingForPreliminaryScreening',
    displayStatus: 'Pending For Preliminary Screening',
    returnReason: null,
    updatedAt: '2026-01-02T03:04:05.000Z',
    firstProgramCode: 'P1',
    firstSupervisorName: 'Prof. One',
    secondProgramCode: null,
    secondSupervisorName: null,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    ...makeSummary(),
    submittedAt: '2026-01-02T03:04:05.000Z',
    editable: true,
    actions: ['save', 'submit'],
    values: {},
    timeline: [],
    ...overrides,
  };
}

export function makeTimelineEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    action: 'submit',
    fromStatus: null,
    toStatus: 'PendingForPreliminaryScreening',
    actorRole: 'student',
    remark: null,
    at: '2026-01-02T03:04:05',
    ...overrides,
  };
}

export function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    emailVerified: true,
    status: 'active',
    role: 'student',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeSupervisorOption(overrides: Partial<SupervisorOption> = {}): SupervisorOption {
  return {
    id: 1,
    name: 'Prof. One',
    nameZh: null,
    userEmpId: 'E1',
    thrustCode: 'P1',
    deptNameEn: 'Function Hub',
    ...overrides,
  };
}
