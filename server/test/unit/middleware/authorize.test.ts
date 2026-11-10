import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { hasRole, requireAuthContext, requireRole } from '@src/middleware/authorize';
import type { AuthContext, UserRole } from '@src/user/user.types';

const auth = (role: UserRole, over: Partial<AuthContext> = {}): AuthContext => ({
  userId: 'u-1',
  role,
  jti: 'jti-1',
  sessionId: 'sid-1',
  amr: ['password'],
  expiresAt: Math.floor(Date.now() / 1000) + 900,
  ...over,
});

const makeReq = (context?: AuthContext): Request => ({ auth: context }) as unknown as Request;

/** asyncHandler 把同步 throw 变成 next(error) 的微任务，这里等它落地 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('角色命中时放行', async () => {
    const next = vi.fn();
    requireRole('admin', 'supervisor')(makeReq(auth('admin')), {} as Response, next);
    await flush();
    expect(next).toHaveBeenCalledWith();
  });

  it('角色不匹配 -> 403，并带上 required / actual 供前端排查', async () => {
    const next = vi.fn();
    requireRole('admin')(makeReq(auth('student')), {} as Response, next);
    await flush();

    const error = next.mock.calls[0]?.[0];
    expect(error).toMatchObject({
      status: 403,
      code: 'forbidden',
      details: { required: ['admin'], actual: 'student' },
    });
  });

  it('未登录 -> 401（路由层粗筛不能依赖 authenticate 一定跑过）', async () => {
    const next = vi.fn();
    requireRole('student')(makeReq(undefined), {} as Response, next);
    await flush();
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401, code: 'unauthorized' });
  });

  it('允许角色列表为空时任何角色都进不去', async () => {
    const next = vi.fn();
    requireRole()(makeReq(auth('admin')), {} as Response, next);
    await flush();
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 403 });
  });
});

describe('hasRole', () => {
  it('未登录返回 false（不抛异常，便于 handler 内分支）', () => {
    expect(hasRole(undefined, 'admin')).toBe(false);
  });

  it('命中任意一个角色即 true', () => {
    expect(hasRole(auth('supervisor'), 'admin', 'supervisor')).toBe(true);
    expect(hasRole(auth('student'), 'admin', 'supervisor')).toBe(false);
  });
});

describe('requireAuthContext', () => {
  it('已登录时原样返回上下文', () => {
    const context = auth('supervisor');
    expect(requireAuthContext(makeReq(context))).toBe(context);
  });

  it('未登录时抛 401', () => {
    expect(() => requireAuthContext(makeReq(undefined))).toThrowError(
      expect.objectContaining({ status: 401, code: 'unauthorized' }),
    );
  });
});
