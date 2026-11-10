import { describe, expect, it } from 'vitest';
import { APPLICATION_STATUSES } from '@/types/application';
import {
  APPLICATION_MESSAGES,
  STATUS_PAGE_MESSAGES,
  formatDateTime,
  formatDateTimeSeconds,
  formatWindow,
  issueMessage,
} from '@/features/application/messages';
import {
  STAFF_MESSAGES,
  actionLabel,
  formatDateTime as staffFormatDateTime,
  formatDateTimeSeconds as staffFormatDateTimeSeconds,
} from '@/features/staff/messages';
import { ADMIN_MESSAGES, ADMIN_STATUS_HINTS, batchFailureMessage } from '@/features/admin/messages';
import { SUPERVISOR_MESSAGES, SUPERVISOR_STATUS_HINTS } from '@/features/supervisor/messages';
import { loginCopy } from '@/features/auth/messages';

describe('application issueMessage', () => {
  it('builds a field-specific required message when a label is known', () => {
    expect(issueMessage('required', 'Email')).toBe('Email is required.');
    expect(issueMessage('required')).toBe('This field is required.');
  });

  it('builds a field-specific too_long message when a label is known', () => {
    expect(issueMessage('too_long', 'Question 1')).toBe('Question 1 is too long.');
    expect(issueMessage('too_long')).toBe('The value is too long.');
  });

  it('translates known server issue codes', () => {
    expect(issueMessage('duplicate_program')).toBe('The two program choices must be different.');
    expect(issueMessage('supervisor_program_mismatch')).toBe(
      'The selected supervisor does not belong to this program.',
    );
    expect(issueMessage('too_many_rows')).toBe('There are too many rows in this section.');
  });

  it('falls back to a generic English hint for unknown codes', () => {
    expect(issueMessage('something_server_specific')).toBe('Please check this field.');
  });
});

describe('application date formatting', () => {
  it('formats a valid timestamp to minute precision', () => {
    expect(formatDateTime('2026-01-02T03:04:05')).toBe('2026-01-02 03:04');
  });

  it('formats a valid timestamp to second precision', () => {
    expect(formatDateTimeSeconds('2026-01-02T03:04:05')).toBe('2026-01-02 03:04:05');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['an invalid date', 'not-a-date'],
  ])('shows an em dash for %s', (_label, value) => {
    expect(formatDateTime(value)).toBe('—');
    expect(formatDateTimeSeconds(value)).toBe('—');
  });

  it('renders the submission window only when both bounds exist', () => {
    expect(formatWindow('2026-01-02T03:04:05', '2026-02-03T04:05:06')).toBe(
      '2026-01-02 03:04 – 2026-02-03 04:05',
    );
    expect(formatWindow(null, '2026-02-03T04:05:06')).toBe('');
    expect(formatWindow('2026-01-02T03:04:05', null)).toBe('');
  });
});

describe('application copy', () => {
  it('keeps the pending application-number placeholder', () => {
    expect(APPLICATION_MESSAGES.applicationNoPending).toBe('—');
  });

  it('keeps the status page column labels used by the table', () => {
    expect(Object.keys(STATUS_PAGE_MESSAGES.columns).sort()).toEqual([
      'action',
      'applicationNumber',
      'dueDate',
      'name',
      'returnReason',
      'status',
      'time',
    ]);
  });
});

describe('staff messages', () => {
  it('labels known actions and echoes unknown ones', () => {
    expect(actionLabel('send_offer')).toBe('Send Offer');
    expect(actionLabel('decline_offer')).toBe('Decline Offer');
    expect(actionLabel('legacy_action')).toBe('legacy_action');
  });

  it('formats timestamps identically to the student side', () => {
    expect(staffFormatDateTime('2026-01-02T03:04:05')).toBe('2026-01-02 03:04');
    expect(staffFormatDateTimeSeconds('2026-01-02T03:04:05')).toBe('2026-01-02 03:04:05');
    expect(staffFormatDateTime(null)).toBe('—');
  });

  it('has all the status-history column captions', () => {
    expect(STAFF_MESSAGES.history).toMatchObject({
      title: 'Status History',
      action: 'Action',
      from: 'From',
      to: 'To',
      actor: 'Actor',
      remark: 'Remark',
      time: 'Time',
      empty: 'No status changes yet.',
    });
  });
});

describe('admin messages', () => {
  it('describes a hint for every status', () => {
    expect(Object.keys(ADMIN_STATUS_HINTS)).toHaveLength(APPLICATION_STATUSES.length);
    for (const status of APPLICATION_STATUSES) {
      expect(ADMIN_STATUS_HINTS[status]).toBeTruthy();
    }
    expect(ADMIN_STATUS_HINTS.SupervisorRecommended).toBe('Ready to send an offer.');
  });

  it('translates known batch failure codes and falls back for unknown ones', () => {
    expect(batchFailureMessage('invalid_transition')).toBe(
      'This action is not allowed in the current status.',
    );
    expect(batchFailureMessage('role_forbidden')).toBe('Your role cannot perform this action.');
    expect(batchFailureMessage('weird_code')).toBe(
      'Unable to send the offer for this application.',
    );
  });

  it('interpolates counts and application numbers into the copy', () => {
    expect(ADMIN_MESSAGES.filter.batchButton(3)).toBe('Send Offer (3)');
    expect(ADMIN_MESSAGES.batch.summary(2, 1, 3)).toBe('2 succeeded, 1 failed out of 3.');
    expect(ADMIN_MESSAGES.approve.confirmContent('SC-1')).toContain('SC-1');
    expect(ADMIN_MESSAGES.filter.selectRow('SC-1')).toBe('Select application SC-1');
  });
});

describe('supervisor messages', () => {
  it('describes a hint for every status, including the invisible ones', () => {
    expect(Object.keys(SUPERVISOR_STATUS_HINTS)).toHaveLength(APPLICATION_STATUSES.length);
    for (const status of APPLICATION_STATUSES) {
      expect(SUPERVISOR_STATUS_HINTS[status]).toBeTruthy();
    }
    expect(SUPERVISOR_STATUS_HINTS.Draft).toBe('This application is not visible to supervisors.');
    expect(SUPERVISOR_STATUS_HINTS.PendingSupervisorReview).toBe('Awaiting your review.');
  });

  it('interpolates the application number into the confirmation copy', () => {
    expect(SUPERVISOR_MESSAGES.recommend.confirmContent('SC-9')).toContain('SC-9');
    expect(SUPERVISOR_MESSAGES.title).toBe('Assigned Applications');
  });
});

describe('login copy', () => {
  it('pluralises the OTP validity hint correctly', () => {
    expect(loginCopy.otpValidFor(1)).toBe('It is valid for 1 minute.');
    expect(loginCopy.otpValidFor(5)).toBe('It is valid for 5 minutes.');
  });

  it('interpolates the resend countdown', () => {
    expect(loginCopy.resendIn(60)).toBe('Resend in 60s');
  });

  it('uses the same email/password labels as the forms', () => {
    expect(loginCopy.emailLabel).toBe('Email Address');
    expect(loginCopy.passwordLabel).toBe('Password');
    expect(loginCopy.passcodeLabel).toBe('Passcode');
  });
});
