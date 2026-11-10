import type { RequestHandler } from 'express';
import { notFound } from '../common/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`接口不存在：${req.method} ${req.originalUrl}`));
};
