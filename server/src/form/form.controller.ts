import type { Request, Response } from 'express';
import { unauthorized } from '../common/errors';
import { ok } from '../common/response';
import type { AuthContext } from '../user/user.types';
import { formService } from './form.service';
import {
  batchOfferSchema,
  listQuerySchema,
  returnSchema,
  reviewSchema,
  saveSchema,
  supervisorQuerySchema,
} from './form.schema';

const requireAuth = (req: Request): AuthContext => {
  if (!req.auth) throw unauthorized('请先登录');
  return req.auth;
};

const idOf = (req: Request): string => String(req.params.id);

/**
 * 表单/申请相关的 HTTP 入口。
 * 控制器只做三件事：取参数 -> 调 service -> 包成 { code, message, data }。
 */
export const formController = {
  /** GET /form/schema —— 表单配置（sections/fields/options/提交窗口） */
  schema: async (_req: Request, res: Response): Promise<void> => {
    ok(res, await formService.getSchema());
  },

  /** GET /form/supervisors?programCode=AMAT&keyword=bl —— 志愿导师候选 */
  supervisors: async (req: Request, res: Response): Promise<void> => {
    const query = supervisorQuerySchema.parse(req.query);
    const items = await formService.searchSupervisors(query.programCode, query.keyword, query.limit);
    ok(res, { items });
  },

  /** GET /form/applications —— 三端共用列表（按角色自动收窄） */
  list: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const query = listQuerySchema.parse(req.query);
    ok(res, await formService.list(auth, query));
  },

  /** GET /form/applications/mine —— 学生端「我那一份」 */
  mine: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.mine(auth));
  },

  /** GET /form/applications/:id —— 详情（含服务端算好的 actions） */
  detail: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.getDetail(auth, idOf(req)));
  },

  /** POST /form/applications —— 首次 Save：创建 Draft + 生成 Application No. */
  create: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const input = saveSchema.parse(req.body);
    ok(res, await formService.create(auth, input.values), 201);
  },

  /** PUT /form/applications/:id —— Save（不校验必填） */
  save: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const input = saveSchema.parse(req.body);
    ok(res, await formService.save(auth, idOf(req), input.values));
  },

  /** POST /form/applications/:id/submit —— Draft -> PendingForPreliminaryScreening */
  submit: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.submit(auth, idOf(req)));
  },

  /** POST /form/applications/:id/resubmit —— Returned -> PendingForPreliminaryScreening */
  resubmit: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.resubmit(auth, idOf(req)));
  },

  /** POST /form/applications/:id/approve —— 初筛通过，转导师审核 */
  approve: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.approve(auth, idOf(req)));
  },

  /** POST /form/applications/:id/return —— 退回学生修改（原因必填） */
  returnToStudent: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const input = returnSchema.parse(req.body);
    ok(res, await formService.returnToStudent(auth, idOf(req), input.reason));
  },

  /** POST /form/applications/:id/recommend —— 导师推荐 */
  recommend: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const input = reviewSchema.parse(req.body ?? {});
    ok(res, await formService.recommend(auth, idOf(req), input.reason));
  },

  /** POST /form/applications/:id/reject —— 导师拒绝 */
  reject: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const input = reviewSchema.parse(req.body ?? {});
    ok(res, await formService.reject(auth, idOf(req), input.reason));
  },

  /** POST /form/applications/:id/send-offer —— 单条发送 Offer */
  sendOffer: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.sendOffer(auth, idOf(req)));
  },

  /** POST /form/applications/:id/accept-offer —— 学生接受 Offer */
  acceptOffer: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.acceptOffer(auth, idOf(req)));
  },

  /** POST /form/applications/:id/decline-offer —— 学生拒绝 Offer */
  declineOffer: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.declineOffer(auth, idOf(req)));
  },

  /** POST /form/offers/batch —— 批量发送 Offer（并行 + 单条超时） */
  batchOffer: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const input = batchOfferSchema.parse(req.body);
    ok(res, await formService.sendOfferBatch(auth, input.ids));
  },

  /** GET /form/applications/:id/history —— 状态流转时间线 */
  history: async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    ok(res, await formService.history(auth, idOf(req)));
  },
};
