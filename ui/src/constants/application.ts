import type { ApplicationStatus } from '@/types/application';

/**
 * 状态文字色调，与附件 application-status.png 一致：
 * 失效/负面的终态（Offer Declined 等）置灰，其余为正常正文色。
 */
export type StatusTone = 'default' | 'success' | 'muted';

export interface StatusMeta {
  /** 学生端展示文案，与服务端 displayStatus 保持一致；作为兜底 */
  label: string;
  /** Ant Design Tag 颜色（申请表页头仍用彩色 Tag） */
  color: string;
  /** 状态页表格里的文字色调 */
  tone: StatusTone;
}

/**
 * 学生端状态文案。
 *
 * 与服务端 form/form.display.ts 的 STUDENT_DISPLAY 一一对应：
 *   - `Returned` → Pending for Update（附件文案）
 *   - `SupervisorRecommended` → Recommended（附件文案，不折叠成 Under Review）
 */
export const STUDENT_STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  Draft: { label: 'Draft', color: 'default', tone: 'default' },
  PendingForPreliminaryScreening: { label: 'Under Review', color: 'blue', tone: 'default' },
  Returned: { label: 'Pending for Update', color: 'orange', tone: 'default' },
  PendingSupervisorReview: { label: 'Under Review', color: 'blue', tone: 'default' },
  SupervisorRecommended: { label: 'Recommended', color: 'green', tone: 'default' },
  SupervisorRejected: { label: 'Rejected', color: 'red', tone: 'default' },
  OfferSent: { label: 'Pending for Offer Acceptance', color: 'gold', tone: 'default' },
  OfferAccepted: { label: 'Offer Accepted', color: 'green', tone: 'default' },
  OfferDeclined: { label: 'Offer Declined', color: 'red', tone: 'muted' },
};

/**
 * 附件 application-status.png 里出现、但本期未实现的状态（reserved）。
 *
 * 它们与现有状态机（笔试题「简要流程 / 动作 × 状态」）对不上，因此：
 *   - 不进 ApplicationStatus，不参与任何流转与匹配；
 *   - 状态页不渲染这些行，仅在这里登记文案与置灰样式，方便后续补齐；
 *   - README 中标记为 reserved。
 */
export const RESERVED_STATUS_META = {
  attendanceRequired: {
    label: 'Action Required: Confirm Attendance',
    tone: 'muted',
  },
  attendanceConfirmed: {
    label: 'Attendance Confirmed',
    tone: 'muted',
  },
  attendanceDeclined: {
    label: 'Attendance Declined',
    tone: 'muted',
  },
  offerLapsed: {
    label: 'Offer Lapsed',
    tone: 'muted',
  },
  rejectLetterSent: {
    label: 'Reject Letter Sent',
    tone: 'muted',
  },
  withdrawn: {
    label: 'Withdrawn',
    tone: 'muted',
  },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

/** 学生仍可编辑的状态；其余状态整份表单只读 */
export const STUDENT_EDITABLE_STATUSES: readonly ApplicationStatus[] = ['Draft', 'Returned'];

/** 状态页/入口页判断：草稿或退回都需要继续填表 */
export const isEditableStatus = (status: ApplicationStatus): boolean =>
  STUDENT_EDITABLE_STATUSES.includes(status);
