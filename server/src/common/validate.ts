import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

/** 把 async handler 的 rejection 交给 Express 的错误处理中间件。 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res, next).catch(next);
  };

type ValidateSource = 'body' | 'query' | 'params';

/**
 * 用 zod 校验并「替换」请求数据，后续 controller 拿到的是已清洗的类型。
 * zod 抛出的 ZodError 由 error-handler 统一转成 400。
 */
export const validate =
  (schema: ZodTypeAny, source: ValidateSource = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Express 5 的 req.query 是 getter，只在 body/params 上回写。
    if (source === 'body') {
      req.body = result.data;
    }
    next();
  };
