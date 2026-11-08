import type { RequestHandler } from 'express';
import { env } from '../config';
import { AppError } from '../common/errors';
import { timingSafeEqual } from '../common/crypto';

/**
 * 双提交 Cookie 校验（Double Submit Cookie）：
 *   1. 登录成功时下发一个非 HttpOnly 的 csrf cookie
 *   2. SPA 读取它并放进 X-CSRF-Token 头
 *   3. 服务端比对两者是否一致
 *
 * 攻击者可以「带着 Cookie 发请求」，但读不到 Cookie 内容，因此伪造不出请求头。
 */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  const cookieToken: unknown = req.cookies?.[env.cookie.csrfName];
  const headerToken = req.get('x-csrf-token');

  if (
    typeof cookieToken !== 'string' ||
    !cookieToken ||
    !headerToken ||
    !timingSafeEqual(cookieToken, headerToken)
  ) {
    next(new AppError(403, 'csrf_token_invalid', 'CSRF 校验失败，请刷新页面后重试'));
    return;
  }

  next();
};
