import { Router } from 'express';
import { asyncHandler, validate } from '../common/validate';
import { authenticate } from '../middleware/authenticate';
import { requireCsrf } from '../middleware/csrf';
import { userController } from './user.controller';
import {
  changePasswordSchema,
  logonSchema,
  otpRequestSchema,
  registerSchema,
  verifyEmailSchema,
} from './user.schema';
import { oauthRoutes } from './oauth/oauth.routes';

/**
 * 所有登录相关路由都收敛在 server/src/user 下，由根路由挂到 /user。
 *
 *   POST /user/register        注册（发验证码）
 *   POST /user/otp             发送一次性验证码
 *   POST /user/email/verify    校验注册验证码
 *   POST /user/logon           登录（密码 / 验证码）
 *   POST /user/token/refresh   刷新 access token
 *   GET  /user/csrf            获取 CSRF token
 *   POST /user/logout          登出
 *   GET  /user/me              当前用户
 *   POST /user/password/change 设置/修改密码
 *   GET  /user/oauth/*         第三方登录
 */
export const userRoutes = Router();

userRoutes.post('/register', validate(registerSchema), asyncHandler(userController.register));
userRoutes.post('/otp', validate(otpRequestSchema), asyncHandler(userController.requestOtp));
userRoutes.post('/email/verify', validate(verifyEmailSchema), asyncHandler(userController.verifyEmail));
userRoutes.post('/logon', validate(logonSchema), asyncHandler(userController.logon));

userRoutes.post('/token/refresh', requireCsrf, asyncHandler(userController.refresh));
userRoutes.get('/csrf', asyncHandler(userController.csrf));

userRoutes.post('/logout', authenticate, requireCsrf, asyncHandler(userController.logout));
userRoutes.get('/me', authenticate, asyncHandler(userController.me));
userRoutes.post(
  '/password/change',
  authenticate,
  requireCsrf,
  validate(changePasswordSchema),
  asyncHandler(userController.changePassword),
);

userRoutes.use('/oauth', oauthRoutes);
