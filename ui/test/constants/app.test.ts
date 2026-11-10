import { describe, expect, it } from 'vitest';
import { APP_NAME, LOGIN_PATH, OTP_RESEND_SECONDS } from '@/constants/app';
import { ROLE_HOME, ROLE_LABELS } from '@/constants/roles';
import { USER_ROLES } from '@/types/user';

describe('app constants', () => {
  it('exposes the shared product constants', () => {
    expect(APP_NAME).toBe('Summer Camp');
    expect(LOGIN_PATH).toBe('/login');
  });

  it('keeps the OTP resend cooldown in sync with the server contract (60s)', () => {
    expect(OTP_RESEND_SECONDS).toBe(60);
  });
});

describe('role constants', () => {
  it('defines exactly one home path per user role', () => {
    expect(Object.keys(ROLE_HOME).sort()).toEqual([...USER_ROLES].sort());
    expect(ROLE_HOME).toEqual({
      student: '/start',
      admin: '/admin/applications',
      supervisor: '/supervisor/applications',
    });
  });

  it('defines a human label per role', () => {
    expect(ROLE_LABELS).toEqual({
      student: 'Student',
      admin: 'Admin',
      supervisor: 'Supervisor',
    });
  });
});
