import type { ApplicationStatus } from '@/types/application';

/** 导师端专属文案（英文界面）；通用 Status History / 日期格式在 features/staff/messages.ts */
export const SUPERVISOR_MESSAGES = {
  title: 'Assigned Applications',
  intro:
    'Applications assigned to you as the first-choice supervisor. Recommend or reject applicants who passed the preliminary screening.',

  filter: {
    statusLabel: 'Status',
    all: 'All',
    searchPlaceholder: 'Application No. / name / email',
    reset: 'Reset',
    empty: 'No applications match these filters.',
    emptyAll: 'No applications are assigned to you yet.',
    clearFilters: 'Clear filters',
  },

  columns: {
    applicationNumber: 'Application No.',
    applicant: 'Applicant',
    program: 'Program',
    status: 'Status',
    updatedAt: 'Last Updated',
    action: 'Action',
  },

  action: {
    recommend: 'Recommend',
    reject: 'Reject',
    cancel: 'Cancel',
  },

  recommend: {
    confirmTitle: 'Recommend this applicant?',
    confirmContent: (applicationNumber: string) =>
      `Application ${applicationNumber} will be marked as Supervisor Recommended and forwarded to the administrator.`,
    success: 'Application recommended.',
  },

  reject: {
    title: 'Reject application',
    remarkLabel: 'Remark (optional)',
    placeholder: 'Explain why this application is rejected (optional).',
    success: 'Application rejected.',
  },

  detail: {
    back: '← Applications',
    submitted: 'Submitted',
    firstChoice: 'First Choice',
    secondChoice: 'Second Choice',
    lastUpdated: 'Last Updated',
    notFoundTitle: 'Application not found',
    notFoundHint: 'The application may not exist, or it is not assigned to you.',
    backToList: 'Back to Applications',
    loadFailedTitle: 'Unable to load this application',
    tryAgain: 'Try again',
    readOnly: 'Read-only',
  },

  notRegistered: {
    title: 'Supervisor profile not linked',
    hint: 'This account is not linked to a supervisor profile. Please contact the administrator to link your account.',
  },

  loading: 'Loading applications…',
  loadFailed: 'Unable to load applications. Please try again.',
  actionFailed: 'Unable to complete this action. Please try again.',
  stale: 'The status has changed. The page has been refreshed.',
} as const;

/** 详情页粘底操作条左侧的状态说明；理论上导师只会看到前 6 个状态 */
export const SUPERVISOR_STATUS_HINTS: Record<ApplicationStatus, string> = {
  Draft: 'This application is not visible to supervisors.',
  PendingForPreliminaryScreening: 'This application is not visible to supervisors.',
  Returned: 'This application is not visible to supervisors.',
  PendingSupervisorReview: 'Awaiting your review.',
  SupervisorRecommended:
    'You recommended this applicant. Waiting for the administrator to send an offer.',
  SupervisorRejected: 'You rejected this application.',
  OfferSent: 'Offer sent, waiting for the applicant to respond.',
  OfferAccepted: 'Offer accepted by the applicant.',
  OfferDeclined: 'Offer declined by the applicant.',
};
