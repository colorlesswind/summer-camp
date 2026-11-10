import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { env } from '@src/config';
import { trustedOrigin } from '@src/middleware/trusted-origin';

const makeReq = (method: string, origin?: string | null): Request =>
  ({
    method,
    get: (name: string) => (name.toLowerCase() === 'origin' ? (origin ?? undefined) : undefined),
  }) as unknown as Request;

const run = (req: Request) => {
  const next = vi.fn();
  trustedOrigin(req, {} as Response, next);
  return next;
};

describe('trustedOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('安全方法（GET/HEAD/OPTIONS）不做 Origin 校验', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const next = run(makeReq(method, 'https://evil.example'));
      expect(next).toHaveBeenCalledWith();
    }
  });

  it('没有 Origin 头时放行（curl / 服务端调用 / 原生客户端）', () => {
    expect(run(makeReq('POST')).mock.calls[0]?.[0]).toBeUndefined();
  });

  it('允许 APP_ORIGIN', () => {
    expect(run(makeReq('POST', env.appOrigin)).mock.calls[0]?.[0]).toBeUndefined();
  });

  it('允许 CORS_ORIGINS 里的来源', () => {
    const next = run(makeReq('POST', env.corsOrigins[1] as string));
    expect(next.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('比较时忽略大小写与末尾斜杠', () => {
    const upper = env.appOrigin.toUpperCase();
    expect(run(makeReq('POST', `${upper}/`)).mock.calls[0]?.[0]).toBeUndefined();
  });

  it('跨站来源 -> 403 origin_not_allowed', () => {
    const next = run(makeReq('POST', 'https://evil.example'));
    const error = next.mock.calls[0]?.[0];
    expect(error).toMatchObject({ status: 403, code: 'origin_not_allowed' });
  });

  it('只校验前缀相似的来源不会误放行（evil.lab.example vs lab.example）', () => {
    const next = run(makeReq('PUT', `${env.appOrigin}.evil.example`));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 403 });
  });
});
