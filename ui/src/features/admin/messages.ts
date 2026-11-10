import type { ApplicationStatus } from '@/types/application';

/**
 * 管理端专属文案（英文界面）。
 * 与导师端共用的 Status History 文案、日期格式化、动作文案在 features/staff/messages.ts。
 */
export const ADMIN_MESSAGES = {
  title: 'Applications',
  intro: 'Review applications and send offers to recommended candidates.',

  filter: {
    statusLabel: 'Status',
    all: 'All',
    searchPlaceholder: 'Application No. / name / email',
    reset: 'Reset',
    empty: 'No applications match these filters.',
    emptyAll: 'No applications yet.',
    clearFilters: 'Clear filters',
    batchHint: 'Only applications with status Supervisor Recommended can receive an offer.',
    batchButton: (count: number) => `Send Offer (${count})`,
    selectAll: 'Select all eligible applications on this page',
    selectRow: (applicationNumber: string) => `Select application ${applicationNumber}`,
  },

  columns: {
    applicationNumber: 'Application No.',
    applicant: 'Applicant',
    firstChoice: 'First Choice',
    secondChoice: 'Second Choice',
    status: 'Status',
    updatedAt: 'Last Updated',
    action: 'Action',
  },

  action: {
    approve: 'Approve',
    return: 'Return',
    sendOffer: 'Send Offer',
    cancel: 'Cancel',
    confirm: 'Confirm',
  },

  approve: {
    confirmTitle: 'Approve this application?',
    confirmContent: (applicationNumber: string) =>
      `Application ${applicationNumber} will be sent to the supervisor for review.`,
    success: 'Application approved and sent to the supervisor.',
  },

  return: {
    title: 'Return application',
    reasonLabel: 'Return reason',
    placeholder: 'Explain what the applicant needs to update.',
    required: 'Return reason is required.',
    success: 'Application returned to the applicant.',
  },

  offer: {
    confirmTitle: 'Send this offer?',
    confirmContent: (applicationNumber: string) =>
      `Application ${applicationNumber} will be marked as Offer Sent.`,
    batchConfirmTitle: 'Send offers?',
    batchConfirmContent: (count: number) =>
      `${count} selected application(s) will be marked as Offer Sent.`,
    batchConfirm: 'Send Offers',
    success: 'Offer sent.',
    allSuccess: (count: number) => `Offer sent to ${count} application(s).`,
  },

  batch: {
    resultTitle: 'Send Offer result',
    summary: (successCount: number, failureCount: number, total: number) =>
      `${successCount} succeeded, ${failureCount} failed out of ${total}.`,
    failureApplication: 'Application No.',
    failureReason: 'Reason',
    close: 'Close',
  },

  detail: {
    back: '← Applications',
    notFoundTitle: 'Application not found',
    notFoundHint: 'The application may have been removed, or you may not have access to it.',
    backToList: 'Back to Applications',
    loadFailedTitle: 'Unable to load this application',
    tryAgain: 'Try again',
    submitted: 'Submitted',
    firstChoice: 'First Choice',
    secondChoice: 'Second Choice',
    reviewer: 'Reviewer',
    lastUpdated: 'Last Updated',
    returnReason: 'Return reason',
    readOnly: 'Read-only',
  },

  loading: 'Loading applications…',
  loadFailed: 'Unable to load applications. Please try again.',
  actionFailed: 'Unable to complete this action. Please try again.',
  stale: 'The status has changed. The page has been refreshed.',
} as const;

/** 详情页粘底操作条左侧的状态说明 */
export const ADMIN_STATUS_HINTS: Record<ApplicationStatus, string> = {
  Draft: 'This application is still a draft and cannot be reviewed yet.',
  PendingForPreliminaryScreening: 'Awaiting preliminary screening.',
  Returned: 'Waiting for the applicant to update and resubmit.',
  PendingSupervisorReview: 'Awaiting supervisor review.',
  SupervisorRecommended: 'Ready to send an offer.',
  SupervisorRejected: 'Rejected by the supervisor.',
  OfferSent: 'Offer sent, waiting for the applicant to respond.',
  OfferAccepted: 'Offer accepted by the applicant.',
  OfferDeclined: 'Offer declined by the applicant.',
};

/**
 * 批量 Send Offer 的失败原因是 200 响应体里的 `code + message`，
 * message 是服务端中文原文；这里按 code 翻译，未知码用兜底英文。
 */
const BATCH_FAILURE_MESSAGES: Record<string, string> = {
  invalid_transition: 'This action is not allowed in the current status.',
  timeout: 'Processing timed out. Please try again.',
  role_forbidden: 'Your role cannot perform this action.',
  not_found: 'Application not found.',
  internal_error: 'Something went wrong on the server.',
  application_exists: 'An application already exists for this account.',
};

export const batchFailureMessage = (code: string): string =>
  BATCH_FAILURE_MESSAGES[code] ?? 'Unable to send the offer for this application.';
