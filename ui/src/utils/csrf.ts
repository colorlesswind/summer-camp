import { readCookie } from './cookie';

/**
 * CSRF 双提交：服务端把 token 同时写进可读 Cookie 和响应体。
 * 默认 Cookie 名为 sc_csrf（见 server/.env 的 CSRF_COOKIE_NAME）。
 */
export const CSRF_COOKIE_NAME = 'sc_csrf';

let fallbackToken: string | null = null;

/** 跨域部署时 Cookie 可能不可读，登录/刷新响应里的 csrfToken 作为兜底 */
export function setCsrfFallbackToken(token: string | null): void {
  fallbackToken = token;
}

export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE_NAME) ?? fallbackToken;
}
