import dayjs from 'dayjs';

/** 页面固定文案（英文界面） */
export const APPLICATION_MESSAGES = {
  pageTitle: 'APPLICATION FORM',
  sidebarTitle: 'SUMMER CAMP',
  sidebarMenu: 'Application Form',
  applicationNumber: 'Application No.',
  status: 'Status',
  previous: 'Previous',
  save: 'Save',
  submit: 'Submit',
  resubmit: 'Resubmit',
  saving: 'Saving…',
  submitting: 'Submitting…',
  allSaved: 'All changes saved',
  unsaved: 'Unsaved changes',
  lastUpdated: 'Last updated',
  loading: 'Loading application…',
  addRow: 'Add row',
  removeRow: 'Remove',
  noEntries: 'No entries yet.',
  selectPlaceholder: 'Please select',
  searchSupervisor: 'Type a name to search',
  selectProgramFirst: 'Please select a program first',
  startApplication: 'Start application',
  openApplication: 'Open application',
  continueApplication: 'Continue application',
  backToStatus: 'Back to Application Status',
  noApplicationTitle: 'No application yet',
  noApplicationHint: 'Start a new application to apply for the Summer Camp.',
  loadFailedTitle: 'Unable to load this application',
  saveFailed: 'Unable to save the application. Please try again.',
  submitFailed: 'Unable to submit the application. Please try again.',
  leaveConfirm: 'You have unsaved changes. Leave this page anyway?',
  statementFallback: 'I agree to the statement above.',
  applicationNoPending: '—',
} as const;

/** 服务端 validation issue code → 英文提示 */
const ISSUE_MESSAGES: Record<string, string> = {
  required: 'This field is required.',
  invalid_type: 'Please enter a valid value.',
  invalid_format: 'Please enter a valid value.',
  too_long: 'The value is too long.',
  too_many_rows: 'There are too many rows in this section.',
  invalid_option: 'Please select a valid option.',
  missing_dependency: 'Please complete the related field first.',
  duplicate_program: 'The two program choices must be different.',
  duplicate_supervisor: 'The two supervisor choices must be different.',
  supervisor_program_mismatch: 'The selected supervisor does not belong to this program.',
  unknown_field: 'This field is not supported by the form configuration.',
};

/**
 * 服务端字段错误文案是中文，前端统一展示英文：
 * 优先按 code 翻译，再补上字段名。
 */
export function issueMessage(code: string, label?: string): string {
  if (code === 'required') return label ? `${label} is required.` : ISSUE_MESSAGES.required;
  if (code === 'too_long') return label ? `${label} is too long.` : ISSUE_MESSAGES.too_long;
  return ISSUE_MESSAGES[code] ?? 'Please check this field.';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '—';
}

export function formatWindow(opensAt: string | null, closesAt: string | null): string {
  if (!opensAt || !closesAt) return '';
  return `${formatDateTime(opensAt)} – ${formatDateTime(closesAt)}`;
}
