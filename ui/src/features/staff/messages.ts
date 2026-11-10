import dayjs from 'dayjs';

/**
 * 管理端与导师端共用的展示文案 / 工具函数。
 * 角色专属的文案仍放在 features/admin/messages.ts 与 features/supervisor/messages.ts。
 */
export const STAFF_MESSAGES = {
  history: {
    title: 'Status History',
    action: 'Action',
    from: 'From',
    to: 'To',
    actor: 'Actor',
    remark: 'Remark',
    time: 'Time',
    empty: 'No status changes yet.',
  },
} as const;

/** 状态流转日志里的动作文案（三端动作都在同一张表里出现，所以保留全集） */
export const ACTION_LABELS: Record<string, string> = {
  save: 'Save',
  submit: 'Submit',
  resubmit: 'Resubmit',
  return: 'Return',
  approve: 'Approve',
  recommend: 'Recommend',
  reject: 'Reject',
  send_offer: 'Send Offer',
  accept_offer: 'Accept Offer',
  decline_offer: 'Decline Offer',
};

export const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '—';
}

/** Status History 的 Time 列精确到秒 */
export function formatDateTimeSeconds(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : '—';
}
