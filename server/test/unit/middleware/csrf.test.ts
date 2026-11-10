import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { env } from '@src/config';
import { AppError } from '@src/common/errors';
import { requireCsrf } from '@src/middleware/csrf';

const makeReq = (options: { cookies?: Record<string, string>; header?: string | null }): Request =>
  ({
    cookies: options.cookies ?? {},
    get: (name: string) =>
      name.toLowerCase() === 'x-csrf-token' ? (options.header ?? undefined) : undefined,
  }) as unknown as Request;

const run = (req: Request) => {
  const next = vi.fn();
  requireCsrf(req, {} as Response, next);
  return next;
};

describe('requireCsrf（双提交 Cookie）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Cookie 与请求头一致时放行', () => {
    const next = run(makeReq({ cookies: { [env.cookie.csrfName]: 'token-abc' }, header: 'token-abc' }));
    expect(next).toHaveBeenCalledWith();
  });

  it('缺少 Cookie -> 403 csrf_token_invalid', () => {
    const next = run(makeReq({ header: 'token-abc' }));
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 403, code: 'csrf_token_invalid' });
  });

  it('缺少请求头 -> 403（攻击者能带 Cookie 但读不到 Cookie 值）', () => {
    const next = run(makeReq({ cookies: { [env.cookie.csrfName]: 'token-abc' } }));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 403, code: 'csrf_token_invalid' });
  });

  it('两者不一致 -> 403', () => {
    const next = run(makeReq({ cookies: { [env.cookie.csrfName]: 'token-abc' }, header: 'token-xyz' }));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 403, code: 'csrf_token_invalid' });
  });

  it('长度不同也不会抛异常（timingSafeEqual 已处理）', () => {
    const next = run(makeReq({ cookies: { [env.cookie.csrfName]: 'short' }, header: 'a-much-longer-token' }));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 403 });
  });

  it('空字符串 Cookie 视为缺失', () => {
    const next = run(makeReq({ cookies: { [env.cookie.csrfName]: '' }, header: '' }));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 403, code: 'csrf_token_invalid' });
  });
});
