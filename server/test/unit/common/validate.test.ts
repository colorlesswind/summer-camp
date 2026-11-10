import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { asyncHandler, validate } from '@src/common/validate';

const req = (over: Record<string, unknown> = {}) => over as unknown as Request;
const res = {} as Response;

describe('asyncHandler', () => {
  it('正常 resolve 时不调用 next', async () => {
    const next = vi.fn();
    const handler = asyncHandler(async () => {
      /* noop */
    });

    handler(req(), res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
  });

  it('reject 时把错误交给 next（而不是变成 unhandled rejection）', async () => {
    const next = vi.fn();
    const boom = new Error('boom');
    const handler = asyncHandler(async () => {
      throw boom;
    });

    handler(req(), res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(boom);
  });

  it('把 req/res/next 原样透传给业务函数', async () => {
    const fn = vi.fn(async () => undefined);
    const request = req({ body: { a: 1 } });
    const next = vi.fn();

    asyncHandler(fn)(request, res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(fn).toHaveBeenCalledWith(request, res, next);
  });
});

describe('validate', () => {
  const schema = z
    .object({ email: z.string().trim().toLowerCase().email(), age: z.coerce.number().int() })
    .strict();

  it('校验通过时把清洗后的值写回 req.body', () => {
    const request = req({ body: { email: '  A@B.COM  ', age: '18' } });
    const next = vi.fn();

    validate(schema)(request, res, next);

    expect(next).toHaveBeenCalledWith();
    // trim + toLowerCase 来自 schema，coerce 把 '18' 变成数字
    expect(request.body).toEqual({ email: 'a@b.com', age: 18 });
  });

  it('校验失败时把 ZodError 交给 next，且不改动 req.body', () => {
    const original = { body: { email: 'not-an-email', age: 'x' } };
    const request = req(original);
    const next = vi.fn();

    validate(schema)(request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(ZodError);
    expect(request.body).toEqual({ email: 'not-an-email', age: 'x' });
  });

  it('source=query 时只校验不回写（Express 5 的 req.query 是 getter）', () => {
    const request = req({ query: { email: 'a@b.com', age: '20' } });
    const next = vi.fn();

    validate(schema, 'query')(request, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(request.query).toEqual({ email: 'a@b.com', age: '20' });
  });

  it('source=params 时同样不回写', () => {
    const paramsSchema = z.object({ id: z.string().regex(/^[0-9A-Z]{26}$/) });
    const request = req({ params: { id: 'NOT-VALID' } });
    const next = vi.fn();

    validate(paramsSchema, 'params')(request, res, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ZodError);
    expect(request.params).toEqual({ id: 'NOT-VALID' });
  });
});

describe('NextFunction 类型契约', () => {
  it('next 既可无参调用，也可带错误调用', () => {
    const next: NextFunction = vi.fn();
    next();
    next(new Error('x'));
    expect(next).toHaveBeenCalledTimes(2);
  });
});
