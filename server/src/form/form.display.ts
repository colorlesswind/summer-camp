import type { ApplicationStatus } from './application.state';
import type { UserRole } from '../user/user.types';

/**
 * 状态 → 展示文案。
 *
 * 依据笔试题「状态与展示」：
 *   - 学生端看到的是「业务语义」文案（Under Review / Need Update / ...），
 *     多个内部状态会折叠成同一个 Under Review；
 *   - 管理端与导师端一致，直接展示内部状态的可读化形式。
 *
 * 内部 status 永远原样返回，前端要判断逻辑时用 status，要显示时用 displayStatus。
 */
const STUDENT_DISPLAY: Record<ApplicationStatus, string> = {
  Draft: 'Draft',
  PendingForPreliminaryScreening: 'Under Review',
  Returned: 'Need Update',
  PendingSupervisorReview: 'Under Review',
  SupervisorRecommended: 'Under Review',
  SupervisorRejected: 'Rejected',
  OfferSent: 'Pending for Offer Acceptance',
  OfferAccepted: 'Offer Accepted',
  OfferDeclined: 'Offer Declined',
};

const STAFF_DISPLAY: Record<ApplicationStatus, string> = {
  Draft: 'Draft',
  PendingForPreliminaryScreening: 'Pending For Preliminary Screening',
  Returned: 'Returned',
  PendingSupervisorReview: 'Pending Supervisor Review',
  SupervisorRecommended: 'Supervisor Recommended',
  SupervisorRejected: 'Supervisor Rejected',
  OfferSent: 'Offer Sent',
  OfferAccepted: 'Offer Accepted',
  OfferDeclined: 'Offer Declined',
};

export const toDisplayStatus = (status: ApplicationStatus, role: UserRole): string =>
  role === 'student' ? STUDENT_DISPLAY[status] : STAFF_DISPLAY[status];

/**
 * 导师端可见范围：PendingSupervisorReview 及之后。
 * 未进入导师审核的申请对导师完全不可见（按 404 处理，避免探测）。
 */
export const SUPERVISOR_VISIBLE_STATUSES: readonly ApplicationStatus[] = [
  'PendingSupervisorReview',
  'SupervisorRecommended',
  'SupervisorRejected',
  'OfferSent',
  'OfferAccepted',
  'OfferDeclined',
];

export const isVisibleToSupervisor = (status: ApplicationStatus): boolean =>
  SUPERVISOR_VISIBLE_STATUSES.includes(status);

/** 全部合法状态，用于查询参数校验与下拉筛选 */
export const ALL_STATUSES: readonly ApplicationStatus[] = [
  'Draft',
  'PendingForPreliminaryScreening',
  'Returned',
  'PendingSupervisorReview',
  'SupervisorRecommended',
  'SupervisorRejected',
  'OfferSent',
  'OfferAccepted',
  'OfferDeclined',
];

export const isApplicationStatus = (value: string): value is ApplicationStatus =>
  (ALL_STATUSES as readonly string[]).includes(value);
