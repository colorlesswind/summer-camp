import type { Request, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../common/errors';
import { asyncHandler } from '../common/validate';
import type { AuthContext, UserRole } from '../user/user.types';

/**
 * 路由级角色校验（粗筛）。
 *
 * 只回答「这个角色能不能访问这个接口」，不关心资源状态。
 * 「当前状态能不能做这个动作」由 form/application.state.ts 的 assertCan 负责，
 * 两层都要做：路由层快速 403，服务层才是真正的业务闸门。
 *
 * 用法：
 *   router.post('/applications/:id/approve', authenticate, requireRole('admin'), ...)
 */
export const requireRole = (...roles: UserRole[]): RequestHandler => {
  const allowed = new Set<UserRole>(roles);

  return asyncHandler(async (req, _res, next) => {
    if (!req.auth) throw unauthorized('请先登录');
    if (!allowed.has(req.auth.role)) {
      throw forbidden('当前角色无权执行此操作', {
        required: roles,
        actual: req.auth.role,
      });
    }
    next();
  });
};

/** 需要在 handler 内部做分支判断时使用，避免到处 assert `req.auth` */
export const hasRole = (auth: AuthContext | undefined, ...roles: UserRole[]): boolean =>
  auth !== undefined && roles.includes(auth.role);

/** 只取已登录的上下文，未登录直接 401 */
export const requireAuthContext = (req: Request): AuthContext => {
  if (!req.auth) throw unauthorized('请先登录');
  return req.auth;
};
