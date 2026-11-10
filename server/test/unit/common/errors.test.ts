import { describe, expect, it } from 'vitest';
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  internal,
  invalidGrant,
  notFound,
  serviceUnavailable,
  tooManyRequests,
  unauthorized,
} from '@src/common/errors';

describe('AppError', () => {
  it('保存 status / code / message / details', () => {
    const error = new AppError(422, 'unprocessable', '参数有问题', [{ path: 'a' }]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.status).toBe(422);
    expect(error.code).toBe('unprocessable');
    expect(error.message).toBe('参数有问题');
    expect(error.details).toEqual([{ path: 'a' }]);
  });

  it('expose 由 status 推导：4xx 对外暴露，5xx 不暴露', () => {
    expect(new AppError(400, 'x', 'x').expose).toBe(true);
    expect(new AppError(404, 'x', 'x').expose).toBe(true);
    expect(new AppError(499, 'x', 'x').expose).toBe(true);
    expect(new AppError(500, 'x', 'x').expose).toBe(false);
    expect(new AppError(503, 'x', 'x').expose).toBe(false);
  });
});

describe('错误工厂', () => {
  it('badRequest -> 400 invalid_request', () => {
    const error = badRequest('请求不合法', { field: 'email' });
    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_request');
    expect(error.details).toEqual({ field: 'email' });
  });

  it('unauthorized 使用默认文案', () => {
    expect(unauthorized().status).toBe(401);
    expect(unauthorized().code).toBe('unauthorized');
    expect(unauthorized().message).toBe('未认证或凭证已失效');
  });

  it('forbidden 可以带 details（error-handler 会用 details.code 覆盖顶层 code）', () => {
    const error = forbidden('无权', { code: 'not_resource_owner' });
    expect(error.status).toBe(403);
    expect(error.details).toEqual({ code: 'not_resource_owner' });
  });

  it('notFound / conflict / serviceUnavailable 的默认语义', () => {
    expect([notFound().status, notFound().code]).toEqual([404, 'not_found']);
    expect([conflict('重复').status, conflict('重复').code]).toEqual([409, 'conflict']);
    expect([serviceUnavailable().status, serviceUnavailable().code]).toEqual([
      503,
      'temporarily_unavailable',
    ]);
  });

  it('tooManyRequests 把 retryAfterSeconds 放进 details（供 Retry-After 头使用）', () => {
    const error = tooManyRequests('太频繁', 42);
    expect(error.status).toBe(429);
    expect(error.code).toBe('rate_limited');
    expect(error.details).toEqual({ retryAfterSeconds: 42 });
  });

  it('internal 是 500 且不暴露细节', () => {
    const error = internal('数据库炸了');
    expect(error.status).toBe(500);
    expect(error.code).toBe('internal_error');
    expect(error.expose).toBe(false);
  });

  it('invalidGrant 统一用 401 invalid_grant，避免暴露具体原因', () => {
    const error = invalidGrant();
    expect(error.status).toBe(401);
    expect(error.code).toBe('invalid_grant');
    expect(error.message).toBe('登录凭证无效');
  });
});
