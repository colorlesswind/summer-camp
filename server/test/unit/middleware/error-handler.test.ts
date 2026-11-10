import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('@src/common/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { AppError } from '@src/common/errors';
import { logger } from '@src/common/logger';
import { errorHandler } from '@src/middleware/error-handler';
import { z } from 'zod';

interface CapturedResponse {
  res: Response;
  status: number;
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
  headersSent: boolean;
}

const makeRes = (): CapturedResponse => {
  const captured: CapturedResponse = {
    res: undefined as unknown as Response,
    status: 200,
    body: undefined,
    headers: {},
    headersSent: false,
  };

  const res = {
    get headersSent() {
      return captured.headersSent;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body as Record<string, unknown>;
      return res;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
      return res;
    },
  };

  captured.res = res as unknown as Response;
  return captured;
};

const makeReq = (url = '/x') => ({ originalUrl: url }) as Request;

const run = (
  error: unknown,
  captured: CapturedResponse,
  req: Request = makeReq(),
): { next: NextFunction; nextArgs: unknown[] } => {
  const next = vi.fn();
  (errorHandler as unknown as (e: unknown, q: Request, s: Response, n: NextFunction) => void)(
    error,
    req,
    captured.res,
    next,
  );
  return { next, nextArgs: next.mock.calls[0] ?? [] };
};

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ZodError -> 400 validation_failed，并把 issues 摊平成 path/code/message', () => {
    const parsed = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
    const captured = makeRes();

    run(parsed.error, captured);

    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({
      type: 'about:blank#validation_failed',
      title: 'validation_failed',
      status: 400,
      code: 'validation_failed',
      detail: '请求参数校验失败',
    });
    expect(captured.body?.errors).toEqual([
      { path: 'email', code: 'invalid_string', message: expect.any(String) },
    ]);
  });

  it('AppError 4xx：用 details.code 覆盖顶层 code（业务细节优先）', () => {
    const captured = makeRes();
    const error = new AppError(409, 'conflict', '当前状态不允许该操作', { code: 'invalid_transition' });

    run(error, captured);

    expect(captured.status).toBe(409);
    expect(captured.body).toMatchObject({
      code: 'invalid_transition',
      message: '当前状态不允许该操作',
      detail: '当前状态不允许该操作',
      status: 409,
    });
    expect(captured.body?.errors).toEqual({ code: 'invalid_transition' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('AppError 5xx：细节只写日志，对外统一文案', () => {
    const captured = makeRes();
    const error = new AppError(503, 'temporarily_unavailable', '数据库连接池炸了');

    run(error, captured, makeReq('/form/applications'));

    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({ code: 'temporarily_unavailable', message: '服务器内部错误' });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, path: '/form/applications' }),
      'application error',
    );
  });

  it('429 会写 Retry-After 头', () => {
    const captured = makeRes();
    run(new AppError(429, 'rate_limited', '太频繁', { retryAfterSeconds: 42 }), captured);
    expect(captured.headers['Retry-After']).toBe('42');
  });

  it('429 没有 retryAfterSeconds 时不写头（避免 Retry-After: undefined）', () => {
    const captured = makeRes();
    run(new AppError(429, 'rate_limited', '太频繁'), captured);
    expect(captured.headers['Retry-After']).toBeUndefined();
  });

  it('请求体 JSON 解析失败 -> 400 invalid_json', () => {
    const captured = makeRes();
    run({ type: 'entity.parse.failed', status: 400, body: '{bad json' }, captured);
    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({ code: 'invalid_json', detail: '请求体不是合法的 JSON' });
  });

  it('MySQL 唯一键冲突 -> 409 conflict', () => {
    const captured = makeRes();
    run({ code: 'ER_DUP_ENTRY', errno: 1062 }, captured);
    expect(captured.status).toBe(409);
    expect(captured.body).toMatchObject({ code: 'conflict', detail: '资源已存在' });
  });

  it('未知异常 -> 500 internal_error 且不泄露原始 message', () => {
    const captured = makeRes();
    run(new Error('secret detail: root password is hunter2'), captured);

    expect(captured.status).toBe(500);
    expect(captured.body).toMatchObject({ code: 'internal_error', detail: '服务器内部错误' });
    expect(JSON.stringify(captured.body)).not.toContain('hunter2');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'unhandled error',
    );
  });

  it('响应头已发出时不再二次响应，交给默认错误处理', () => {
    const captured = makeRes();
    captured.headersSent = true;

    const { next, nextArgs } = run(new Error('late'), captured);

    expect(next).toHaveBeenCalledTimes(1);
    expect(nextArgs[0]).toBeInstanceOf(Error);
    expect(captured.body).toBeUndefined();
  });
});
