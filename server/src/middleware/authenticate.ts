import type { Request, RequestHandler } from 'express';
import { env } from '../config';
import { AppError, unauthorized } from '../common/errors';
import { asyncHandler } from '../common/validate';
import { tokenService } from '../user/auth/token.service';
import { jwtDenylistRepository } from '../user/auth/denylist.repository';
import { usersRepository } from '../user/user.repository';

/** Cookie 优先，其次兼容 Authorization: Bearer（方便 Postman / 服务端调用） */
export const extractAccessToken = (req: Request): string | null => {
  const cookieToken: unknown = req.cookies?.[env.cookie.accessName];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;

  const header = req.get('authorization');
  if (header && header.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return null;
};

const resolveAuthContext = async (req: Request) => {
  const token = extractAccessToken(req);
  if (!token) return null;

  const claims = await tokenService.verifyAccessToken(token);
  if (await jwtDenylistRepository.isRevoked(claims.jti)) {
    throw unauthorized('登录状态已失效，请重新登录');
  }

  // 角色不进 token：每次请求读库，保证降权/封禁立即生效。
  // 认证本身仍然只看 token，这里只是为了拿到 role 与最新 status。
  const user = await usersRepository.findById(claims.sub);
  if (!user || user.status !== 'active') {
    throw unauthorized('账号状态异常，请重新登录');
  }

  return {
    userId: claims.sub,
    role: user.role,
    jti: claims.jti,
    sessionId: claims.sid,
    amr: claims.amr,
    expiresAt: claims.exp,
  };
};

/** 必须登录 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const auth = await resolveAuthContext(req);
  if (!auth) throw unauthorized('请先登录');
  req.auth = auth;
  next();
});

/** 可选登录：用于「登录后再绑定第三方账号」这类分支 */
export const authenticateOptional: RequestHandler = asyncHandler(async (req, _res, next) => {
  try {
    const auth = await resolveAuthContext(req);
    if (auth) req.auth = auth;
  } catch (error) {
    // 可选场景下 token 失效不应该阻断请求
    if (!(error instanceof AppError)) throw error;
  }
  next();
});
