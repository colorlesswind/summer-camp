import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  assertCan,
  assertOwnership,
  assertSubmissionWindowOpen,
  canPerform,
  isWithinSubmissionWindow,
  requiresSubmissionWindow,
  type ApplicationAction,
  type ApplicationStatus,
} from '@src/form/application.state';
import type { UserRole } from '@src/user/user.types';

/** 与 application.state.ts 的 ApplicationStatus 联合类型一一对应（类型层穷举，漏一个会编译失败） */
const LOCAL_STATUSES: readonly ApplicationStatus[] = [
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

const ACTIONS = Object.keys(TRANSITIONS) as ApplicationAction[];

const statuses = (over: Partial<Record<ApplicationStatus, true>> = {}): ApplicationStatus[] =>
  LOCAL_STATUSES.filter((status) => over[status] === true);

describe('TRANSITIONS 定义', () => {
  it('覆盖全部 10 个动作', () => {
    expect(ACTIONS.sort()).toEqual(
      [
        'accept_offer',
        'approve',
        'decline_offer',
        'recommend',
        'reject',
        'resubmit',
        'return',
        'save',
        'send_offer',
        'submit',
      ].sort(),
    );
  });

  it('只有 save 允许在记录不存在时执行（首次保存）', () => {
    expect(ACTIONS.filter((action) => TRANSITIONS[action].create === true)).toEqual(['save']);
  });

  it('只有 save 是「保持当前状态」（to=null）', () => {
    expect(ACTIONS.filter((action) => TRANSITIONS[action].to === null)).toEqual(['save']);
  });

  it('每个动作至少绑定一个角色，且角色都是合法角色', () => {
    const roles: UserRole[] = ['student', 'admin', 'supervisor'];
    for (const action of ACTIONS) {
      const rule = TRANSITIONS[action];
      expect(rule.roles.length).toBeGreaterThan(0);
      expect(rule.roles.every((role) => roles.includes(role))).toBe(true);
    }
  });

  it('状态流转的 to 都是合法状态', () => {
    for (const action of ACTIONS) {
      const to = TRANSITIONS[action].to;
      if (to !== null) expect(LOCAL_STATUSES).toContain(to);
    }
  });

  it('状态流转的 from 都是合法状态', () => {
    for (const action of ACTIONS) {
      for (const from of TRANSITIONS[action].from) {
        expect(LOCAL_STATUSES).toContain(from);
      }
    }
  });
});

describe('canPerform（纯查询，前端按钮显隐用）', () => {
  it('记录不存在时只有学生 save 返回 true', () => {
    for (const action of ACTIONS) {
      for (const role of ['student', 'admin', 'supervisor'] as UserRole[]) {
        expect(canPerform(action, role, null)).toBe(action === 'save' && role === 'student');
      }
    }
  });

  it('学生 Draft：可 save / submit，不可 approve 或 resubmit', () => {
    expect(canPerform('save', 'student', 'Draft')).toBe(true);
    expect(canPerform('submit', 'student', 'Draft')).toBe(true);
    expect(canPerform('resubmit', 'student', 'Draft')).toBe(false);
    expect(canPerform('approve', 'student', 'Draft')).toBe(false);
  });

  it('学生 Returned：可 save / resubmit', () => {
    expect(canPerform('save', 'student', 'Returned')).toBe(true);
    expect(canPerform('resubmit', 'student', 'Returned')).toBe(true);
    expect(canPerform('submit', 'student', 'Returned')).toBe(false);
  });

  it('管理员只能在 PendingForPreliminaryScreening 做 approve / return', () => {
    expect(canPerform('approve', 'admin', 'PendingForPreliminaryScreening')).toBe(true);
    expect(canPerform('return', 'admin', 'PendingForPreliminaryScreening')).toBe(true);
    expect(canPerform('approve', 'admin', 'Draft')).toBe(false);
    // 导师动作不能被管理员借用
    expect(canPerform('recommend', 'admin', 'PendingSupervisorReview')).toBe(false);
  });

  it('导师只能在 PendingSupervisorReview 做 recommend / reject', () => {
    expect(canPerform('recommend', 'supervisor', 'PendingSupervisorReview')).toBe(true);
    expect(canPerform('reject', 'supervisor', 'PendingSupervisorReview')).toBe(true);
    expect(canPerform('recommend', 'supervisor', 'SupervisorRecommended')).toBe(false);
  });

  it('Send Offer 只能从 SupervisorRecommended 发出，且只能是管理员', () => {
    expect(canPerform('send_offer', 'admin', 'SupervisorRecommended')).toBe(true);
    expect(canPerform('send_offer', 'admin', 'SupervisorRejected')).toBe(false);
    expect(canPerform('send_offer', 'supervisor', 'SupervisorRecommended')).toBe(false);
  });

  it('Offer 的接受/拒绝只能由学生从 OfferSent 发起', () => {
    expect(canPerform('accept_offer', 'student', 'OfferSent')).toBe(true);
    expect(canPerform('decline_offer', 'student', 'OfferSent')).toBe(true);
    expect(canPerform('accept_offer', 'student', 'OfferAccepted')).toBe(false);
    expect(canPerform('accept_offer', 'admin', 'OfferSent')).toBe(false);
  });

  it('终态（OfferAccepted / OfferDeclined / SupervisorRejected）不再允许任何动作', () => {
    for (const terminal of ['OfferAccepted', 'OfferDeclined', 'SupervisorRejected'] as ApplicationStatus[]) {
      for (const role of ['student', 'admin', 'supervisor'] as UserRole[]) {
        expect(ACTIONS.filter((action) => canPerform(action, role, terminal))).toEqual([]);
      }
    }
  });
});

describe('assertCan（服务层闸门）', () => {
  it('角色不对 -> 403 role_forbidden，并带上 requiredRoles', () => {
    expect(() => assertCan('approve', 'student', 'PendingForPreliminaryScreening')).toThrowError(
      expect.objectContaining({
        status: 403,
        details: expect.objectContaining({
          code: 'role_forbidden',
          action: 'approve',
          role: 'student',
          requiredRoles: ['admin'],
        }),
      }),
    );
  });

  it('状态不对 -> 409 invalid_transition，并带上 allowedFrom', () => {
    expect(() => assertCan('approve', 'admin', 'Draft')).toThrowError(
      expect.objectContaining({
        status: 409,
        details: expect.objectContaining({
          code: 'invalid_transition',
          action: 'approve',
          current: 'Draft',
          allowedFrom: ['PendingForPreliminaryScreening'],
        }),
      }),
    );
  });

  it('记录不存在 + save -> 放行（首次保存）', () => {
    expect(() => assertCan('save', 'student', null)).not.toThrow();
  });

  it('记录不存在 + 其它动作 -> 409', () => {
    for (const action of ACTIONS.filter((item) => item !== 'save')) {
      expect(() => assertCan(action, 'admin', null)).toThrowError(
        expect.objectContaining({ status: expect.any(Number) }),
      );
    }
  });

  it('角色正确 + 状态正确 -> 放行', () => {
    expect(() => assertCan('submit', 'student', 'Draft')).not.toThrow();
    expect(() => assertCan('resubmit', 'student', 'Returned')).not.toThrow();
    expect(() => assertCan('return', 'admin', 'PendingForPreliminaryScreening')).not.toThrow();
    expect(() => assertCan('recommend', 'supervisor', 'PendingSupervisorReview')).not.toThrow();
    expect(() => assertCan('send_offer', 'admin', 'SupervisorRecommended')).not.toThrow();
    expect(() => assertCan('accept_offer', 'student', 'OfferSent')).not.toThrow();
  });

  it('角色检查先于状态检查（学生 submit 已提交的申请报 409 而不是 403）', () => {
    expect(() => assertCan('submit', 'student', 'OfferSent')).toThrowError(
      expect.objectContaining({
        status: 409,
        details: expect.objectContaining({ code: 'invalid_transition' }),
      }),
    );
  });
});

describe('assertOwnership', () => {
  it('本人操作放行', () => {
    expect(() => assertOwnership('user-1', 'user-1')).not.toThrow();
  });

  it('操作他人申请 -> 403 not_resource_owner（防 IDOR）', () => {
    expect(() => assertOwnership('user-1', 'user-2')).toThrowError(
      expect.objectContaining({
        status: 403,
        details: { code: 'not_resource_owner' },
      }),
    );
  });
});

describe('提交时间段', () => {
  it('只有 submit 受时间段限制（resubmit 不受限）', () => {
    expect(requiresSubmissionWindow('submit')).toBe(true);
    for (const action of ACTIONS.filter((item) => item !== 'submit')) {
      expect(requiresSubmissionWindow(action)).toBe(false);
    }
  });

  it('isWithinSubmissionWindow 边界包含两端', () => {
    const windows = [
      { opensAt: new Date('2026-03-01T00:00:00.000Z'), closesAt: new Date('2026-03-31T00:00:00.000Z') },
    ];

    expect(isWithinSubmissionWindow(new Date('2026-03-15T00:00:00.000Z'), windows)).toBe(true);
    expect(isWithinSubmissionWindow(new Date('2026-03-01T00:00:00.000Z'), windows)).toBe(true);
    expect(isWithinSubmissionWindow(new Date('2026-03-31T00:00:00.000Z'), windows)).toBe(true);
    expect(isWithinSubmissionWindow(new Date('2026-02-28T23:59:59.000Z'), windows)).toBe(false);
  });

  it('多个窗口只要命中一个即可', () => {
    const windows = [
      { opensAt: new Date('2026-01-01T00:00:00.000Z'), closesAt: new Date('2026-01-31T00:00:00.000Z') },
      { opensAt: new Date('2026-06-01T00:00:00.000Z'), closesAt: new Date('2026-06-30T00:00:00.000Z') },
    ];
    expect(isWithinSubmissionWindow(new Date('2026-06-15T00:00:00.000Z'), windows)).toBe(true);
    expect(isWithinSubmissionWindow(new Date('2026-04-15T00:00:00.000Z'), windows)).toBe(false);
    expect(isWithinSubmissionWindow(new Date('2026-06-15T00:00:00.000Z'), [])).toBe(false);
  });

  it('assertSubmissionWindowOpen 窗口外抛 409 submission_window_closed（与状态错误区分）', () => {
    expect(() =>
      assertSubmissionWindowOpen(new Date('2026-04-15T00:00:00.000Z'), [
        { opensAt: new Date('2026-06-01T00:00:00.000Z'), closesAt: new Date('2026-06-30T00:00:00.000Z') },
      ]),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        details: { code: 'submission_window_closed' },
      }),
    );
  });

  it('assertSubmissionWindowOpen 窗口内不抛', () => {
    expect(() =>
      assertSubmissionWindowOpen(new Date('2026-06-15T00:00:00.000Z'), [
        { opensAt: new Date('2026-06-01T00:00:00.000Z'), closesAt: new Date('2026-06-30T00:00:00.000Z') },
      ]),
    ).not.toThrow();
  });
});

describe('状态集合', () => {
  it('业务状态正好 9 个，无重复', () => {
    expect(LOCAL_STATUSES).toHaveLength(9);
    expect(new Set(LOCAL_STATUSES).size).toBe(9);
  });

  it('除初始态 Draft 外，每个状态都是某个动作的目标状态（不存在无法到达的状态）', () => {
    const toStatuses = new Set(ACTIONS.map((action) => TRANSITIONS[action].to).filter(Boolean));
    for (const status of LOCAL_STATUSES) {
      if (status === 'Draft') continue;
      expect(toStatuses.has(status)).toBe(true);
    }
  });

  it('终态没有出边（OfferAccepted / OfferDeclined / SupervisorRejected）', () => {
    const fromStatuses = new Set(ACTIONS.flatMap((action) => TRANSITIONS[action].from));
    expect(fromStatuses.has('OfferAccepted')).toBe(false);
    expect(fromStatuses.has('OfferDeclined')).toBe(false);
    expect(fromStatuses.has('SupervisorRejected')).toBe(false);
  });

  it('statuses() 辅助函数本身可用', () => {
    expect(statuses({ Draft: true })).toEqual(['Draft']);
  });
});
