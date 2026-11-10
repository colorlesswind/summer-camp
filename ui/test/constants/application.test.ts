import { describe, expect, it } from 'vitest';
import { APPLICATION_STATUSES } from '@/types/application';
import {
  RESERVED_STATUS_META,
  STAFF_STATUS_META,
  STAFF_STATUS_OPTIONS,
  STUDENT_EDITABLE_STATUSES,
  STUDENT_STATUS_META,
  SUPERVISOR_STATUS_OPTIONS,
  SUPERVISOR_VISIBLE_STATUSES,
  isEditableStatus,
  staffStatusLabel,
} from '@/constants/application';

describe('status metadata', () => {
  it('has a student and a staff entry for every status in the state machine', () => {
    expect(Object.keys(STUDENT_STATUS_META)).toHaveLength(APPLICATION_STATUSES.length);
    expect(Object.keys(STAFF_STATUS_META)).toHaveLength(APPLICATION_STATUSES.length);

    for (const status of APPLICATION_STATUSES) {
      expect(STUDENT_STATUS_META[status].label).toBeTruthy();
      expect(STUDENT_STATUS_META[status].color).toBeTruthy();
      expect(STAFF_STATUS_META[status].label).toBeTruthy();
      expect(STAFF_STATUS_META[status].color).toBeTruthy();
    }
  });

  it('maps the student-facing labels that differ from the raw status names', () => {
    expect(STUDENT_STATUS_META.Returned.label).toBe('Pending for Update');
    expect(STUDENT_STATUS_META.PendingSupervisorReview.label).toBe('Under Review');
    expect(STUDENT_STATUS_META.SupervisorRecommended.label).toBe('Recommended');
    expect(STUDENT_STATUS_META.PendingForPreliminaryScreening.label).toBe('Under Review');
    expect(STUDENT_STATUS_META.OfferSent.label).toBe('Pending for Offer Acceptance');
  });

  it('uses the server staff labels (capitalised "For")', () => {
    expect(STAFF_STATUS_META.PendingForPreliminaryScreening.label).toBe(
      'Pending For Preliminary Screening',
    );
    expect(STAFF_STATUS_META.PendingSupervisorReview.label).toBe('Pending Supervisor Review');
  });

  it('greys out only the negative terminal state on the student status page', () => {
    const muted = APPLICATION_STATUSES.filter(
      (status) => STUDENT_STATUS_META[status].tone === 'muted',
    );

    expect(muted).toEqual(['OfferDeclined']);
  });

  it('keeps all reserved (not implemented) statuses muted', () => {
    for (const meta of Object.values(RESERVED_STATUS_META)) {
      expect(meta.tone).toBe('muted');
      expect(meta.label).toBeTruthy();
    }
  });
});

describe('status options', () => {
  it('offers all nine statuses to the administrator in state-machine order', () => {
    expect(STAFF_STATUS_OPTIONS.map((option) => option.value)).toEqual([...APPLICATION_STATUSES]);
    expect(STAFF_STATUS_OPTIONS[0]).toEqual({ value: 'Draft', label: 'Draft' });
  });

  it('never exposes pre-screening statuses to supervisors', () => {
    expect(SUPERVISOR_VISIBLE_STATUSES).not.toContain('Draft');
    expect(SUPERVISOR_VISIBLE_STATUSES).not.toContain('Returned');
    expect(SUPERVISOR_VISIBLE_STATUSES).not.toContain('PendingForPreliminaryScreening');
    expect(SUPERVISOR_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      ...SUPERVISOR_VISIBLE_STATUSES,
    ]);
    expect(SUPERVISOR_STATUS_OPTIONS.map((option) => option.label)).toEqual([
      'Pending Supervisor Review',
      'Supervisor Recommended',
      'Supervisor Rejected',
      'Offer Sent',
      'Offer Accepted',
      'Offer Declined',
    ]);
  });
});

describe('staffStatusLabel', () => {
  it('translates a known status', () => {
    expect(staffStatusLabel('SupervisorRecommended')).toBe('Supervisor Recommended');
  });

  it('returns the raw value for an unknown status instead of "undefined"', () => {
    expect(staffStatusLabel('SomeLegacyStatus')).toBe('SomeLegacyStatus');
  });
});

describe('isEditableStatus', () => {
  it('only allows editing drafts and returned applications', () => {
    expect(STUDENT_EDITABLE_STATUSES).toEqual(['Draft', 'Returned']);
    expect(isEditableStatus('Draft')).toBe(true);
    expect(isEditableStatus('Returned')).toBe(true);
    expect(isEditableStatus('OfferSent')).toBe(false);
  });
});
