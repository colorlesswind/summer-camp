import type { ApplicationStatus } from '@/types/application';

interface StatusMeta {
  /** 学生端展示文案，与服务端 displayStatus 保持一致；作为兜底 */
  label: string;
  /** Ant Design Tag 颜色 */
  color: string;
}

/**
 * 状态文案以服务端 detail.displayStatus 为准，这里只在服务端字段缺失时兜底，
 * 同时提供 Tag 颜色。管理端/导师端文案下一阶段再加。
 */
export const STUDENT_STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  Draft: { label: 'Draft', color: 'default' },
  PendingForPreliminaryScreening: { label: 'Under Review', color: 'blue' },
  Returned: { label: 'Need Update', color: 'orange' },
  PendingSupervisorReview: { label: 'Under Review', color: 'blue' },
  SupervisorRecommended: { label: 'Under Review', color: 'blue' },
  SupervisorRejected: { label: 'Rejected', color: 'red' },
  OfferSent: { label: 'Pending for Offer Acceptance', color: 'gold' },
  OfferAccepted: { label: 'Offer Accepted', color: 'green' },
  OfferDeclined: { label: 'Offer Declined', color: 'red' },
};

/** 学生仍可编辑的状态；其余状态整份表单只读 */
export const STUDENT_EDITABLE_STATUSES: readonly ApplicationStatus[] = ['Draft', 'Returned'];

/** 状态页/入口页判断：草稿或退回都需要继续填表 */
export const isEditableStatus = (status: ApplicationStatus): boolean =>
  STUDENT_EDITABLE_STATUSES.includes(status);
