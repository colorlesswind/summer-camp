import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { env } from '@src/config';
import { AppError } from '@src/common/errors';

vi.mock('@src/user/auth/token.service', () => ({
  tokenService: { verifyAccessToken: vi.fn() },
}));
vi.mock('@src/user/auth/denylist.repository', () => ({
  jwtDenylistRepository: { isRevoked: vi.fn() },
}));
vi.mock('@src/user/user.repository', () => ({
  usersRepository: { findById: vi.fn() },
}));
vi.mock('@src/common/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { authenticate, authenticateOptional, extractAccessToken } from '@src/middleware/authenticate';
import { tokenService } from '@src/user/auth/token.service';
import { jwtDenylistRepository } from '@src/user/auth/denylist.repository';
import { usersRepository } from '@src/user/user.repository';
import type { UserRow } from '@src/user/user.types';

const verifyAccessToken = vi.mocked(tokenService.verifyAccessToken);
const isRevoked = vi.mocked(jwtDenylistRepository.isRevoked);
const findById = vi.mocked(usersRepository.findById);

const makeReq = (options: {
  cookies?: Record<string, string>;
  authorization?: string;
}): Request =>
  ({
    cookies: options.cookies ?? {},
    get: (name: string) => {
      if (name.toLowerCase() === 'authorization') return options.authorization;
      return undefined;
    },
  }) as unknown as Request;

const claims = {
  sub: 'user-1',
  jti: 'jti-1',
  sid: 'session-1',
  amr: ['password' as const],
  iss: 'summer-camp',
  aud: 'summer-camp-web',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
  typ: 'access' as const,
};

const userRow = (over: Record<string, unknown> = {}): UserRow =>
  ({
    id: 'user-1',
    primary_email: 'a@b.com',
    display_name: null,
    email_verified_at: new Date(),
    status: 'active',
    role: 'student',
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  }) as unknown as UserRow;

const runAuthenticate = async (req: Request) => {
  const next = vi.fn();
  authenticate(req, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return next;
};

const runOptional = async (req: Request) => {
  const next = vi.fn();
  authenticateOptional(req, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return next;
};

describe('extractAccessToken', () => {
  it('优先读 Cookie', () => {
    const req = makeReq({
      cookies: { [env.cookie.accessName]: 'cookie-token' },
      authorization: 'Bearer header-token',
    });
    expect(extractAccessToken(req)).toBe('cookie-token');
  });

  it('没有 Cookie 时支持 Authorization: Bearer（Postman / 服务端调用）', () => {
    expect(extractAccessToken(makeReq({ authorization: 'Bearer header-token' }))).toBe('header-token');
    expect(extractAccessToken(makeReq({ authorization: 'bearer   spaced-token  ' }))).toBe('spaced-token');
  });

  it('都没有时返回 null', () => {
    expect(extractAccessToken(makeReq({}))).toBeNull();
    expect(extractAccessToken(makeReq({ authorization: 'Basic abc' }))).toBeNull();
    expect(extractAccessToken(makeReq({ authorization: 'Bearer    ' }))).toBeNull();
  });
});

describe('authenticate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessToken.mockResolvedValue(claims);
    isRevoked.mockResolvedValue(false);
    findById.mockResolvedValue(userRow());
  });

  it('校验通过后把 AuthContext 挂到 req.auth（role 来自数据库而非 token）', async () => {
    const req = makeReq({ cookies: { [env.cookie.accessName]: 'token' } });
    const next = await runAuthenticate(req);

    expect(verifyAccessToken).toHaveBeenCalledWith('token');
    expect(isRevoked).toHaveBeenCalledWith('jti-1');
    expect(findById).toHaveBeenCalledWith('user-1');
    expect(req.auth).toEqual({
      userId: 'user-1',
      role: 'student',
      jti: 'jti-1',
      sessionId: 'session-1',
      amr: ['password'],
      expiresAt: claims.exp,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('没有 token -> 401 请先登录', async () => {
    const next = await runAuthenticate(makeReq({}));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401, message: '请先登录' });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('token 无效 -> 把 tokenService 的 401 透传出去', async () => {
    verifyAccessToken.mockRejectedValue(new AppError(401, 'unauthorized', '登录状态已失效，请重新登录'));
    const next = await runAuthenticate(makeReq({ cookies: { [env.cookie.accessName]: 'bad' } }));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401, message: '登录状态已失效，请重新登录' });
    expect(isRevoked).not.toHaveBeenCalled();
  });

  it('jti 已被拉黑（登出）-> 401', async () => {
    isRevoked.mockResolvedValue(true);
    const next = await runAuthenticate(makeReq({ cookies: { [env.cookie.accessName]: 'token' } }));
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      status: 401,
      message: '登录状态已失效，请重新登录',
    });
    expect(findById).not.toHaveBeenCalled();
  });

  it('用户不存在 -> 401 账号状态异常', async () => {
    findById.mockResolvedValue(null);
    const next = await runAuthenticate(makeReq({ cookies: { [env.cookie.accessName]: 'token' } }));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401, message: '账号状态异常，请重新登录' });
  });

  it('用户被锁定 -> 401 账号状态异常（降权/封禁立即生效）', async () => {
    findById.mockResolvedValue(userRow({ status: 'locked' }));
    const next = await runAuthenticate(makeReq({ cookies: { [env.cookie.accessName]: 'token' } }));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401, message: '账号状态异常，请重新登录' });
  });
});

describe('authenticateOptional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessToken.mockResolvedValue(claims);
    isRevoked.mockResolvedValue(false);
    findById.mockResolvedValue(userRow({ role: 'admin' }));
  });

  it('未登录时放行且不设置 req.auth', async () => {
    const req = makeReq({});
    const next = await runOptional(req);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toBeUndefined();
  });

  it('有效 token 时设置 req.auth', async () => {
    const req = makeReq({ cookies: { [env.cookie.accessName]: 'token' } });
    const next = await runOptional(req);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toMatchObject({ userId: 'user-1', role: 'admin' });
  });

  it('token 失效不阻断请求（可选登录场景）', async () => {
    verifyAccessToken.mockRejectedValue(new AppError(401, 'unauthorized', 'expired'));
    const req = makeReq({ cookies: { [env.cookie.accessName]: 'stale' } });
    const next = await runOptional(req);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toBeUndefined();
  });

  it('非 AppError（例如代码 bug）仍然交给错误中间件', async () => {
    verifyAccessToken.mockRejectedValue(new TypeError('unexpected'));
    const next = await runOptional(makeReq({ cookies: { [env.cookie.accessName]: 'token' } }));
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
  });
});
