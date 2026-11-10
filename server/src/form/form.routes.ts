import { Router } from 'express';
import { asyncHandler, validate } from '../common/validate';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { requireCsrf } from '../middleware/csrf';
import { formController } from './form.controller';
import { idParamSchema } from './form.schema';

/**
 * 申请表模块路由，由根路由挂到 /form。
 *
 *   GET    /form/schema                              表单配置（三端共用）
 *   GET    /form/supervisors                         志愿导师候选（按 Program 过滤 + 模糊搜索）
 *
 *   GET    /form/applications                        列表（按角色自动收窄：学生本人/导师名下/管理员全部）
 *   GET    /form/applications/mine                   学生端「我那一份」（注意必须排在 :id 之前）
 *   POST   /form/applications                        首次 Save -> Draft + Application No.
 *   GET    /form/applications/:id                    详情
 *   PUT    /form/applications/:id                    Save（不校验必填）
 *   GET    /form/applications/:id/history            状态时间线
 *
 *   POST   /form/applications/:id/submit             学生 Submit
 *   POST   /form/applications/:id/resubmit           学生 Resubmit
 *   POST   /form/applications/:id/approve            管理员 Approve
 *   POST   /form/applications/:id/return             管理员 Return（必填原因）
 *   POST   /form/applications/:id/recommend          导师 Recommend
 *   POST   /form/applications/:id/reject             导师 Reject
 *   POST   /form/applications/:id/send-offer         管理员单条 Send Offer
 *   POST   /form/applications/:id/accept-offer       学生 Accept Offer
 *   POST   /form/applications/:id/decline-offer      学生 Decline Offer
 *   POST   /form/offers/batch                        管理员批量 Send Offer（并行 + 超时）
 *
 * 两层鉴权：路由层 requireRole 只做粗筛；真正的「当前状态能不能做这个动作」
 * 由 form/application.state.ts 的 assertCan 在 service 层校验。
 */
export const formRoutes = Router();

formRoutes.use(authenticate);

const idParam = validate(idParamSchema, 'params');

formRoutes.get('/schema', asyncHandler(formController.schema));
formRoutes.get('/supervisors', asyncHandler(formController.supervisors));

formRoutes.get('/applications', asyncHandler(formController.list));
formRoutes.get('/applications/mine', asyncHandler(formController.mine));
formRoutes.post('/applications', requireRole('student'), requireCsrf, asyncHandler(formController.create));

formRoutes.get('/applications/:id', idParam, asyncHandler(formController.detail));
formRoutes.put('/applications/:id', idParam, requireRole('student'), requireCsrf, asyncHandler(formController.save));
formRoutes.get('/applications/:id/history', idParam, asyncHandler(formController.history));

formRoutes.post(
  '/applications/:id/submit',
  idParam,
  requireRole('student'),
  requireCsrf,
  asyncHandler(formController.submit),
);
formRoutes.post(
  '/applications/:id/resubmit',
  idParam,
  requireRole('student'),
  requireCsrf,
  asyncHandler(formController.resubmit),
);
formRoutes.post(
  '/applications/:id/accept-offer',
  idParam,
  requireRole('student'),
  requireCsrf,
  asyncHandler(formController.acceptOffer),
);
formRoutes.post(
  '/applications/:id/decline-offer',
  idParam,
  requireRole('student'),
  requireCsrf,
  asyncHandler(formController.declineOffer),
);

formRoutes.post(
  '/applications/:id/approve',
  idParam,
  requireRole('admin'),
  requireCsrf,
  asyncHandler(formController.approve),
);
formRoutes.post(
  '/applications/:id/return',
  idParam,
  requireRole('admin'),
  requireCsrf,
  asyncHandler(formController.returnToStudent),
);
formRoutes.post(
  '/applications/:id/send-offer',
  idParam,
  requireRole('admin'),
  requireCsrf,
  asyncHandler(formController.sendOffer),
);

formRoutes.post(
  '/applications/:id/recommend',
  idParam,
  requireRole('supervisor'),
  requireCsrf,
  asyncHandler(formController.recommend),
);
formRoutes.post(
  '/applications/:id/reject',
  idParam,
  requireRole('supervisor'),
  requireCsrf,
  asyncHandler(formController.reject),
);

formRoutes.post('/offers/batch', requireRole('admin'), requireCsrf, asyncHandler(formController.batchOffer));
