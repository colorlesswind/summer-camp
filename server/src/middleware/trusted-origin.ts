import type { RequestHandler } from 'express';
import { env } from '../config';
import { AppError } from '../common/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const normalizeOrigin = (value: string): string => value.replace(/\/+$/, '').toLowerCase();

const allowedOrigins = new Set(
  [env.appOrigin, env.publicBaseUrl, ...env.corsOrigins].map(normalizeOrigin),
);

/**
 * 因为登录态放在 Cookie 里，所有会改变状态的请求都要做 Origin 校验，
 * 这是 SameSite 之外的第一道 CSRF 防线。
 *
 * 没有 Origin 头的请求（curl、服务端调用、部分原生客户端）放行，
 * 浏览器发起的跨站写请求一定会带上 Origin。
 */
export const trustedOrigin: RequestHandler = (req, _res, next) => {
  if (!env.auth.enforceTrustedOrigin || SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }

  if (!allowedOrigins.has(normalizeOrigin(origin))) {
    next(new AppError(403, 'origin_not_allowed', '请求来源不被信任'));
    return;
  }

  next();
};
