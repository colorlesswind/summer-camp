import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../common/errors';
import { logger } from '../common/logger';
import { isDuplicateEntry } from '../db/mysql-errors';

interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  errors?: unknown;
}

const buildProblem = (status: number, code: string, detail: string, errors?: unknown): ProblemDetail => ({
  type: `about:blank#${code}`,
  title: code,
  status,
  code,
  detail,
  ...(errors === undefined ? {} : { errors }),
});

const isBodyParseError = (error: unknown): error is { type: string; status: number } =>
  typeof error === 'object' &&
  error !== null &&
  (error as { type?: unknown }).type === 'entity.parse.failed';

/**
 * 统一出口：
 *   - 所有错误都返回 RFC7807 problem+json（code 为机器可读的错误码）
 *   - 5xx 细节只写日志，不回给客户端
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    }));
    res.status(400).json(buildProblem(400, 'validation_failed', '请求参数校验失败', issues));
    return;
  }

  if (error instanceof AppError) {
    if (error.status === 429) {
      const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
    }
    if (!error.expose) {
      logger.error({ err: error, path: req.originalUrl }, 'application error');
    }
    res
      .status(error.status)
      .json(buildProblem(error.status, error.code, error.expose ? error.message : '服务器内部错误', error.details));
    return;
  }

  if (isBodyParseError(error)) {
    res.status(400).json(buildProblem(400, 'invalid_json', '请求体不是合法的 JSON'));
    return;
  }

  if (isDuplicateEntry(error)) {
    res.status(409).json(buildProblem(409, 'conflict', '资源已存在'));
    return;
  }

  logger.error({ err: error, path: req.originalUrl }, 'unhandled error');
  res.status(500).json(buildProblem(500, 'internal_error', '服务器内部错误'));
};
