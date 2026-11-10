// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { LogonResponse, MeResponse, UserProfile } from '@/types/user';

const authApiMock = vi.hoisted(() => ({
  requestLogonOtp: vi.fn(),
  logon: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
}));

const csrfMock = vi.hoisted(() => ({
  setCsrfFallbackToken: vi.fn(),
}));

vi.mock('@/api/auth', () => ({ authApi: authApiMock }));
vi.mock('@/utils/csrf', () => ({
  CSRF_COOKIE_NAME: 'sc_csrf',
  getCsrfToken: () => null,
  setCsrfFallbackToken: csrfMock.setCsrfFallbackToken,
}));

import { useAuthStore } from '@/stores/auth';
import { makeUser } from '../helpers/fixtures';

function makeLogonResponse(overrides: Partial<LogonResponse> = {}): LogonResponse {
  return {
    tokenType: 'Bearer',
    expiresIn: 900,
    user: makeUser(),
    csrfToken: 'csrf-from-body',
    ...overrides,
  };
}

function makeMeResponse(user: UserProfile = makeUser()): MeResponse {
  return { user, identities: [] };
}

function createStore() {
  setActivePinia(createPinia());
  return useAuthStore();
}

describe('auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in the unknown state with no user', () => {
    const store = createStore();

    expect(store.status).toBe('unknown');
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(store.role).toBeNull();
    expect(store.homePath).toBe('/login');
  });

  it('logs in with an OTP and stores the session', async () => {
    const store = createStore();
    authApiMock.logon.mockResolvedValue(makeLogonResponse());

    const user = await store.loginWithOtp('alice@example.com', '123456');

    expect(authApiMock.logon).toHaveBeenCalledWith({
      grant_type: 'otp',
      email: 'alice@example.com',
      otp: '123456',
    });
    expect(user.email).toBe('alice@example.com');
    expect(store.status).toBe('authenticated');
    expect(store.isAuthenticated).toBe(true);
    expect(store.role).toBe('student');
    expect(store.homePath).toBe('/start');
    expect(csrfMock.setCsrfFallbackToken).toHaveBeenCalledWith('csrf-from-body');
  });

  it('logs in with a password and stores the session', async () => {
    const store = createStore();
    authApiMock.logon.mockResolvedValue(
      makeLogonResponse({ user: makeUser({ role: 'admin', email: 'admin@example.com' }) }),
    );

    await store.loginWithPassword('admin@example.com', 'secret');

    expect(authApiMock.logon).toHaveBeenCalledWith({
      grant_type: 'password',
      email: 'admin@example.com',
      password: 'secret',
    });
    expect(store.role).toBe('admin');
    expect(store.homePath).toBe('/admin/applications');
  });

  it('leaves the state untouched when the login request fails', async () => {
    const store = createStore();
    const failure = new Error('invalid_grant');
    authApiMock.logon.mockRejectedValue(failure);

    await expect(store.loginWithOtp('alice@example.com', '000000')).rejects.toBe(failure);

    expect(store.status).toBe('unknown');
    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(csrfMock.setCsrfFallbackToken).not.toHaveBeenCalled();
  });

  it('restores the session from /user/me', async () => {
    const store = createStore();
    authApiMock.me.mockResolvedValue(makeMeResponse());

    await store.bootstrap();

    expect(authApiMock.me).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('authenticated');
    expect(store.isAuthenticated).toBe(true);
    expect(store.user?.email).toBe('alice@example.com');
  });

  it('only bootstraps once per page load', async () => {
    const store = createStore();
    authApiMock.me.mockResolvedValue(makeMeResponse());

    await store.bootstrap();
    await store.bootstrap();

    expect(authApiMock.me).toHaveBeenCalledTimes(1);
  });

  it('treats a failed bootstrap as a guest and does not retry', async () => {
    const store = createStore();
    authApiMock.me.mockRejectedValue(new Error('401'));

    await store.bootstrap();
    await store.bootstrap();

    expect(authApiMock.me).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('guest');
    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(store.homePath).toBe('/login');
  });

  it('shares one in-flight bootstrap between concurrent callers', async () => {
    const store = createStore();
    let resolveMe: ((value: MeResponse) => void) | undefined;
    authApiMock.me.mockReturnValue(
      new Promise<MeResponse>((resolve) => {
        resolveMe = resolve;
      }),
    );

    const first = store.bootstrap();
    const second = store.bootstrap();
    resolveMe?.(makeMeResponse());
    await Promise.all([first, second]);

    expect(authApiMock.me).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('authenticated');
  });

  it('logs out through the API and clears local state', async () => {
    const store = createStore();
    authApiMock.logon.mockResolvedValue(makeLogonResponse());
    authApiMock.logout.mockResolvedValue(undefined);
    await store.loginWithOtp('alice@example.com', '123456');

    await store.logout();

    expect(authApiMock.logout).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('guest');
    expect(store.user).toBeNull();
    expect(csrfMock.setCsrfFallbackToken).toHaveBeenLastCalledWith(null);
  });

  it('clears local state even when the logout request fails', async () => {
    const store = createStore();
    authApiMock.logon.mockResolvedValue(makeLogonResponse());
    const failure = new Error('network');
    authApiMock.logout.mockRejectedValue(failure);
    await store.loginWithOtp('alice@example.com', '123456');

    await expect(store.logout()).rejects.toBe(failure);

    expect(store.status).toBe('guest');
    expect(store.user).toBeNull();
  });

  it('reset() drops the user and the CSRF fallback token', async () => {
    const store = createStore();
    authApiMock.logon.mockResolvedValue(makeLogonResponse());
    await store.loginWithOtp('alice@example.com', '123456');

    store.reset();

    expect(store.status).toBe('guest');
    expect(store.user).toBeNull();
    expect(csrfMock.setCsrfFallbackToken).toHaveBeenLastCalledWith(null);
  });

  it('maps every role to its landing page', async () => {
    const store = createStore();

    for (const [role, home] of [
      ['student', '/start'],
      ['admin', '/admin/applications'],
      ['supervisor', '/supervisor/applications'],
    ] as const) {
      authApiMock.logon.mockResolvedValue(makeLogonResponse({ user: makeUser({ role }) }));
      await store.loginWithOtp('someone@example.com', '123456');

      expect(store.role).toBe(role);
      expect(store.homePath).toBe(home);
    }
  });
});
