import { Router } from 'express';
import { asyncHandler } from './common/validate';
import { logger } from './common/logger';
import { env } from './config';
import { pingDatabase } from './db/pool';
import { formRoutes } from './form/form.routes';
import { userRoutes } from './user/user.routes';

/** 根路由：所有业务模块在这里挂载 */
export function createRouter(): Router {
  const router = Router();

  router.get(
    '/healthz',
    asyncHandler(async (_req, res) => {
      try {
        await pingDatabase();
        res.json({ status: 'ok', time: new Date().toISOString() });
      } catch (error) {
        logger.error({ err: error }, 'health check failed');
        res.status(503).json({ status: 'degraded', database: 'unavailable' });
      }
    }),
  );

  // 认证模块：注册 / 登录 / 验证码 / 刷新 / 登出 / 第三方登录
  router.use('/user', userRoutes);

  // 申请表模块：表单配置 / 申请单 CRUD / 状态流转 / 批量 Offer
  router.use('/form', formRoutes);

  return router;
}

export const appMeta = {
  name: 'summer-camp-server',
  issuer: env.jwt.issuer,
};
