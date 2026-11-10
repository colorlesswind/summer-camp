import { describe, expect, it } from 'vitest';
import { toDisplayStatus, ALL_STATUSES, isApplicationStatus, isVisibleToSupervisor, SUPERVISOR_VISIBLE_STATUSES } from '@src/form/form.display';

const STUDENT_TEXT: Record<string, string> = {
  Draft: 'Draft',
  PendingForPreliminaryScreening: 'Under Review',
  Returned: 'Pending for Update',
  PendingSupervisorReview: 'Under Review',
  SupervisorRecommended: 'Recommended',
  SupervisorRejected: 'Rejected',
  OfferSent: 'Pending for Offer Acceptance',
  OfferAccepted: 'Offer Accepted',
  OfferDeclined: 'Offer Declined',
};

const STAFF_TEXT: Record<string, string> = {
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

describe('toDisplayStatus', () => {
  it('学生端：初筛与导师审核折叠成同一个 Under Review', () => {
    expect(toDisplayStatus('PendingForPreliminaryScreening', 'student')).toBe('Under Review');
    expect(toDisplayStatus('PendingSupervisorReview', 'student')).toBe('Under Review');
  });

  it('学生端：Returned 用附件的 Pending for Update 文案', () => {
    expect(toDisplayStatus('Returned', 'student')).toBe('Pending for Update');
  });

  it('学生端：SupervisorRecommended 不再折叠成 Under Review', () => {
    expect(toDisplayStatus('SupervisorRecommended', 'student')).toBe('Recommended');
  });

  it('学生端全部状态文案与产品文档一致', () => {
    for (const status of ALL_STATUSES) {
      expect(toDisplayStatus(status, 'student')).toBe(STUDENT_TEXT[status]);
    }
  });

  it('管理员与导师看到内部状态的可读化文案', () => {
    for (const status of ALL_STATUSES) {
      expect(toDisplayStatus(status, 'admin')).toBe(STAFF_TEXT[status]);
      expect(toDisplayStatus(status, 'supervisor')).toBe(STAFF_TEXT[status]);
    }
  });

  it('Draft 两端文案相同（草稿无需区分受众）', () => {
    expect(toDisplayStatus('Draft', 'student')).toBe(toDisplayStatus('Draft', 'admin'));
  });
});

describe('导师可见范围', () => {
  it('PendingSupervisorReview 及之后才对导师可见', () => {
    expect(isVisibleToSupervisor('PendingSupervisorReview')).toBe(true);
    expect(isVisibleToSupervisor('SupervisorRecommended')).toBe(true);
    expect(isVisibleToSupervisor('SupervisorRejected')).toBe(true);
    expect(isVisibleToSupervisor('OfferSent')).toBe(true);
    expect(isVisibleToSupervisor('OfferAccepted')).toBe(true);
    expect(isVisibleToSupervisor('OfferDeclined')).toBe(true);
  });

  it('初筛之前的状态对导师不可见（按 404 处理，避免探测）', () => {
    expect(isVisibleToSupervisor('Draft')).toBe(false);
    expect(isVisibleToSupervisor('PendingForPreliminaryScreening')).toBe(false);
    expect(isVisibleToSupervisor('Returned')).toBe(false);
  });

  it('SUPERVISOR_VISIBLE_STATUSES 是 ALL_STATUSES 的严格子集', () => {
    expect(SUPERVISOR_VISIBLE_STATUSES.length).toBeLessThan(ALL_STATUSES.length);
    for (const status of SUPERVISOR_VISIBLE_STATUSES) {
      expect(ALL_STATUSES).toContain(status);
    }
  });
});

describe('isApplicationStatus', () => {
  it('识别合法状态', () => {
    for (const status of ALL_STATUSES) {
      expect(isApplicationStatus(status)).toBe(true);
    }
  });

  it('拒绝拼写错误 / 旧状态 / 空串', () => {
    expect(isApplicationStatus('draft')).toBe(false);
    expect(isApplicationStatus('Pending_Screening')).toBe(false);
    expect(isApplicationStatus('ReadyForReview')).toBe(false);
    expect(isApplicationStatus('')).toBe(false);
  });
});
