import type { Request, Response } from 'express';
import { env } from '../config';
import { unauthorized } from '../common/errors';
import { randomToken } from '../common/crypto';
import { requestContext } from '../common/http';
import { setAuthCookies, clearAuthCookies } from './auth/cookies';
import { userService, type LogonResult } from './user.service';
import type { AuthContext } from './user.types';

const requireAuth = (req: Request): AuthContext => {
  if (!req.auth) throw unauthorized('请先登录');
  return req.auth;
};

/**
 * 统一写 Cookie + 返回响应。
 * token 本体只放在 HttpOnly Cookie 里，响应体只给过期时间和用户信息，
 * 同时额外回一份 csrfToken，方便前后端跨子域部署时读取（Cookie 跨不了子域）。
 */
const respondWithSession = (res: Response, result: LogonResult): void => {
  const csrfToken = randomToken(24);
  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    csrfToken,
    accessExpiresInSeconds: result.accessExpiresInSeconds,
    refreshExpiresInSeconds: result.refreshExpiresInSeconds,
  });

  res.status(200).json({
    tokenType: 'Bearer',
    expiresIn: result.accessExpiresInSeconds,
    user: result.user,
    csrfToken,
  });
};

export const userController = {
  /** POST /user/register -> 202（不区分邮箱是否已存在） */
  register: async (req: Request, res: Response): Promise<void> => {
    const result = await userService.register(req.body, requestContext(req));
    res.status(202).json(result);
  },

  /** POST /user/otp -> 202 */
  requestOtp: async (req: Request, res: Response): Promise<void> => {
    const result = await userService.requestOtp(req.body, requestContext(req));
    res.status(202).json(result);
  },

  /** POST /user/email/verify -> 200 */
  verifyEmail: async (req: Request, res: Response): Promise<void> => {
    const result = await userService.verifyEmail(req.body, requestContext(req));
    res.status(200).json(result);
  },

  /** POST /user/logon -> 200 + Set-Cookie */
  logon: async (req: Request, res: Response): Promise<void> => {
    const result = await userService.logon(req.body, requestContext(req));
    respondWithSession(res, result);
  },

  /** POST /user/token/refresh -> 200 + Set-Cookie（旋转 refresh token） */
  refresh: async (req: Request, res: Response): Promise<void> => {
    const presented: unknown = req.cookies?.[env.cookie.refreshName];
    const result = await userService.refresh(
      typeof presented === 'string' ? presented : undefined,
      requestContext(req),
    );
    respondWithSession(res, result);
  },

  /** GET /user/csrf -> 供 SPA 刷新页面后重新拿回 CSRF token */
  csrf: async (req: Request, res: Response): Promise<void> => {
    const token: unknown = req.cookies?.[env.cookie.csrfName];
    res.json({ csrfToken: typeof token === 'string' ? token : null });
  },

  /** POST /user/logout -> 204 */
  logout: async (req: Request, res: Response): Promise<void> => {
    await userService.logout(requireAuth(req), requestContext(req));
    clearAuthCookies(res);
    res.status(204).end();
  },

  /** GET /user/me -> 200 */
  me: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    res.json(await userService.me(auth.userId));
  },

  /** POST /user/password/change -> 200 */
  changePassword: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const result = await userService.changePassword(auth, req.body, requestContext(req));
    res.json(result);
  },
};
