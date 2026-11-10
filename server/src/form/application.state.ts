import { conflict, forbidden } from '../common/errors';
import type { UserRole } from '../user/user.types';

/**
 * 表单流转状态机 + 动作权限矩阵。
 *
 * 设计原则：
 *   1. 角色只存在 users.role 里（方案 A：一个账号一种角色）；
 *   2. 「谁能做什么、从什么状态到什么状态」是固定业务规则，写在代码里，
 *      不做 role/permission 表化，避免「数据与代码不同步」；
 *   3. 路由层用 requireRole 做粗筛（见 middleware/authorize.ts），
 *      服务层用 assertCan 做真正的状态校验，两层都不能省。
 */

export type ApplicationStatus =
  | 'Draft'
  | 'PendingForPreliminaryScreening'
  | 'Returned'
  | 'PendingSupervisorReview'
  | 'SupervisorRecommended'
  | 'SupervisorRejected'
  | 'OfferSent'
  | 'OfferAccepted'
  | 'OfferDeclined';

export type ApplicationAction =
  | 'save'
  | 'submit'
  | 'resubmit'
  | 'return'
  | 'approve'
  | 'recommend'
  | 'reject'
  | 'send_offer'
  | 'accept_offer'
  | 'decline_offer';

export interface ApplicationTransition {
  /** 允许执行该动作的角色 */
  roles: readonly UserRole[];
  /** 允许的起始状态；空数组表示只能用于「记录尚不存在」的场景 */
  from: readonly ApplicationStatus[];
  /** 目标状态；null 表示保持当前状态（保存草稿） */
  to: ApplicationStatus | null;
  /** 是否允许在记录不存在时执行（首次保存 -> Draft） */
  create?: boolean;
}

export const TRANSITIONS: Readonly<Record<ApplicationAction, ApplicationTransition>> = {
  save: {
    roles: ['student'],
    from: ['Draft', 'Returned'],
    to: null,
    // 首次保存：创建记录，状态 Draft，并生成 Application No.
    create: true,
  },
  submit: {
    roles: ['student'],
    from: ['Draft'],
    to: 'PendingForPreliminaryScreening',
  },
  resubmit: {
    roles: ['student'],
    from: ['Returned'],
    to: 'PendingForPreliminaryScreening',
  },
  return: {
    roles: ['admin'],
    from: ['PendingForPreliminaryScreening'],
    to: 'Returned',
  },
  approve: {
    roles: ['admin'],
    from: ['PendingForPreliminaryScreening'],
    to: 'PendingSupervisorReview',
  },
  recommend: {
    roles: ['supervisor'],
    from: ['PendingSupervisorReview'],
    to: 'SupervisorRecommended',
  },
  reject: {
    roles: ['supervisor'],
    from: ['PendingSupervisorReview'],
    to: 'SupervisorRejected',
  },
  send_offer: {
    roles: ['admin'],
    from: ['SupervisorRecommended'],
    to: 'OfferSent',
  },
  accept_offer: {
    roles: ['student'],
    from: ['OfferSent'],
    to: 'OfferAccepted',
  },
  decline_offer: {
    roles: ['student'],
    from: ['OfferSent'],
    to: 'OfferDeclined',
  },
};

/** 纯查询版本：适合前端做按钮显隐或写单测，不抛异常 */
export const canPerform = (
  action: ApplicationAction,
  role: UserRole,
  current: ApplicationStatus | null,
): boolean => {
  const rule = TRANSITIONS[action];
  if (!rule.roles.includes(role)) return false;
  if (current === null) return rule.create === true;
  return rule.from.includes(current);
};

/**
 * 服务层的动作闸门：角色不对 -> 403；状态不对 -> 409。
 *
 * current 传 null 表示记录还不存在（首次保存）。
 */
export const assertCan = (
  action: ApplicationAction,
  role: UserRole,
  current: ApplicationStatus | null,
): void => {
  const rule = TRANSITIONS[action];

  if (!rule.roles.includes(role)) {
    throw forbidden('当前角色无权执行此操作', {
      code: 'role_forbidden',
      action,
      role,
      requiredRoles: rule.roles,
    });
  }

  if (current === null) {
    if (rule.create !== true) {
      throw conflict('当前状态不允许该操作', { code: 'invalid_transition', action, current, allowedFrom: rule.from });
    }
    return;
  }

  if (!rule.from.includes(current)) {
    throw conflict('当前状态不允许该操作', {
      code: 'invalid_transition',
      action,
      current,
      allowedFrom: rule.from,
    });
  }
};

/** 学生只能操作自己名下的申请（防止越权 IDOR）；服务层每次加载资源后调用 */
export const assertOwnership = (actorUserId: string, ownerUserId: string): void => {
  if (actorUserId !== ownerUserId) {
    throw forbidden('无权操作他人的申请', { code: 'not_resource_owner' });
  }
};

// ---------------------------------------------------------------------
// 提交时间段（2.1）
//
// 只有 submit 受时间段约束；resubmit（Returned -> 重新提交）不受限制。
// 窗口数据来源下一阶段实现（submission_windows 表或配置），这里只放纯函数。
// ---------------------------------------------------------------------

export interface SubmissionWindow {
  opensAt: Date;
  closesAt: Date;
}

/** submit 受提交时间段限制，resubmit 不受限制 */
export const requiresSubmissionWindow = (action: ApplicationAction): boolean => action === 'submit';

export const isWithinSubmissionWindow = (
  now: Date,
  windows: readonly SubmissionWindow[],
): boolean => {
  const time = now.getTime();
  return windows.some(
    (window) => time >= window.opensAt.getTime() && time <= window.closesAt.getTime(),
  );
};

/** 在提交时间段之外执行 submit 时抛 409，与状态错误区分开 */
export const assertSubmissionWindowOpen = (
  now: Date,
  windows: readonly SubmissionWindow[],
): void => {
  if (!isWithinSubmissionWindow(now, windows)) {
    throw conflict('当前不在提交时间段内', { code: 'submission_window_closed' });
  }
};
