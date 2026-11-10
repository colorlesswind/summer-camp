import type { Response } from 'express';
import { env } from '../../config';

/** refresh token 只在刷新接口上出现，Path 收窄到 /user/token，减少被携带的机会 */
export const REFRESH_COOKIE_PATH = '/user/token';

export interface AuthCookiePayload {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

const baseOptions = () => ({
  secure: env.cookie.secure,
  domain: env.cookie.domain || undefined,
});

export const setAuthCookies = (res: Response, payload: AuthCookiePayload): void => {
  // access token：HttpOnly，前端 JS 读不到，天然防 XSS 窃取
  res.cookie(env.cookie.accessName, payload.accessToken, {
    ...baseOptions(),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: payload.accessExpiresInSeconds * 1000,
  });

  // refresh token：SameSite=Strict + Path 收窄，CSRF 与跨站携带都更难
  res.cookie(env.cookie.refreshName, payload.refreshToken, {
    ...baseOptions(),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: payload.refreshExpiresInSeconds * 1000,
  });

  // CSRF token：故意让 JS 可读，供 SPA 放进 X-CSRF-Token 头（双提交校验）
  res.cookie(env.cookie.csrfName, payload.csrfToken, {
    ...baseOptions(),
    httpOnly: false,
    sameSite: 'strict',
    path: '/',
    maxAge: payload.refreshExpiresInSeconds * 1000,
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(env.cookie.accessName, { ...baseOptions(), httpOnly: true, sameSite: 'lax', path: '/' });
  res.clearCookie(env.cookie.refreshName, {
    ...baseOptions(),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
  res.clearCookie(env.cookie.csrfName, {
    ...baseOptions(),
    httpOnly: false,
    sameSite: 'strict',
    path: '/',
  });
};
