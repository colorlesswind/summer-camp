import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { env } from '@src/config';
import {
  REFRESH_COOKIE_PATH,
  clearAuthCookies,
  setAuthCookies,
  type AuthCookiePayload,
} from '@src/user/auth/cookies';

interface CookieCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

const makeRes = () => {
  const cookies: CookieCall[] = [];
  const cleared: CookieCall[] = [];

  const res = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options });
      return res;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      cleared.push({ name, value: '', options });
      return res;
    },
  };

  return { res: res as unknown as Response, cookies, cleared };
};

const payload: AuthCookiePayload = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  csrfToken: 'csrf-token',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
};

describe('setAuthCookies', () => {
  it('下发 3 个 Cookie：access / refresh / csrf', () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, payload);

    expect(cookies.map((c) => c.name)).toEqual([
      env.cookie.accessName,
      env.cookie.refreshName,
      env.cookie.csrfName,
    ]);
  });

  it('access token 是 HttpOnly + SameSite=Lax + Path=/', () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, payload);
    const access = cookies[0]!;

    expect(access.value).toBe('access-token');
    expect(access.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 900 * 1000,
    });
  });

  it('refresh token 是 HttpOnly + SameSite=Strict + Path 收窄到 /user/token', () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, payload);
    const refresh = cookies[1]!;

    expect(refresh.value).toBe('refresh-token');
    expect(refresh.options).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: 604800 * 1000,
    });
    expect(REFRESH_COOKIE_PATH).toBe('/user/token');
  });

  it('csrf token 故意不是 HttpOnly（SPA 要读出来放进请求头）', () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, payload);
    const csrf = cookies[2]!;

    expect(csrf.value).toBe('csrf-token');
    expect(csrf.options).toMatchObject({ httpOnly: false, sameSite: 'strict', path: '/' });
  });

  it('secure 跟随 NODE_ENV=production（测试环境为 false）', () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, payload);
    expect(cookies.every((c) => c.options.secure === env.cookie.secure)).toBe(true);
    expect(env.cookie.secure).toBe(false);
  });
});

describe('clearAuthCookies', () => {
  it('清掉 3 个 Cookie，且 path / httpOnly 与写入时一致（否则浏览器不会覆盖）', () => {
    const { res, cleared } = makeRes();
    clearAuthCookies(res);

    expect(cleared.map((c) => c.name)).toEqual([
      env.cookie.accessName,
      env.cookie.refreshName,
      env.cookie.csrfName,
    ]);
    expect(cleared[0]!.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(cleared[1]!.options).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
    expect(cleared[2]!.options).toMatchObject({ httpOnly: false, sameSite: 'strict', path: '/' });
  });

  it('没有设置 COOKIE_DOMAIN 时 domain 为 undefined', () => {
    const { res, cleared } = makeRes();
    clearAuthCookies(res);
    expect(env.cookie.domain).toBeUndefined();
    expect(cleared.every((c) => c.options.domain === undefined)).toBe(true);
  });
});
