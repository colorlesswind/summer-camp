/** 与服务端 form/application.state.ts 完全一致的状态值 */
export const APPLICATION_STATUSES = [
  'Draft',
  'PendingForPreliminaryScreening',
  'Returned',
  'PendingSupervisorReview',
  'SupervisorRecommended',
  'SupervisorRejected',
  'OfferSent',
  'OfferAccepted',
  'OfferDeclined',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** 服务端 actions 里可能出现的动作 */
export type ApplicationAction =
  | 'save'
  | 'submit'
  | 'resubmit'
  | 'approve'
  | 'return'
  | 'recommend'
  | 'reject'
  | 'send_offer'
  | 'accept_offer'
  | 'decline_offer';

export type FieldWidget =
  | 'free_text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'date_range'
  | 'single_choice'
  | 'single_choice_with_text'
  | 'upload'
  | 'url'
  | 'checkbox'
  | 'fixed_value'
  | 'readonly';

export type FieldValueType = 'string' | 'number' | 'boolean' | 'date';

export interface FieldOption {
  value: string;
  labelEn: string;
  labelZh?: string | null;
}

export interface FormFieldConfig {
  code: string;
  sectionCode: string;
  groupCode: string | null;
  labelEn: string;
  labelZh: string | null;
  widget: FieldWidget;
  valueType: FieldValueType;
  isRequired: boolean;
  maxLength: number | null;
  optionsSource: string | null;
  dependsOnField: string | null;
  guideTextEn: string | null;
  options?: FieldOption[];
}

export interface FormSectionConfig {
  code: string;
  titleEn: string;
  titleZh: string | null;
  payloadKey: string | null;
  isRepeatable: boolean;
  sortOrder: number;
  fields: FormFieldConfig[];
}

export interface StatementConfig {
  fieldCode: string;
  code: string;
  version: string;
  textEn: string;
}

export interface SubmissionWindowState {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface FormSchema {
  meta: {
    serverTime: string;
    submissionWindow: SubmissionWindowState;
    /** 是否允许创建/保存草稿；窗口全部结束后为 false */
    canSaveDraft: boolean;
  };
  sections: FormSectionConfig[];
  statements: StatementConfig[];
  enums: {
    programs: FieldOption[];
    exams: FieldOption[];
  };
}

/** values 的 key 就是 form_fields.code；可重复小节是数组 */
export type FormValues = Record<string, unknown>;

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
  /** 服务端按角色 + 状态 + 归属 + 提交窗口算好的动作 */
  actions: ApplicationAction[];
  values: FormValues;
  timeline: TimelineEntry[];
}

export interface ApplicationListResult {
  items: ApplicationSummary[];
  total: number;
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
  /** 剩余名额（需求 2.1）；旧服务端未返回时视为不限 */
  remaining?: number;
  isFull?: boolean;
}

/** 批量 Send Offer 的失败明细（与 server form.service.ts 对齐） */
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

/** 管理端列表查询参数（status 单选；服务端支持多选，UI 暂不暴露） */
export interface ApplicationListQuery {
  status?: ApplicationStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}
