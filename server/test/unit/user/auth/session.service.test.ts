import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@src/config';
import { sha256Hex } from '@src/common/crypto';

vi.mock('@src/user/auth/refresh-token.repository', () => ({
  refreshTokenRepository: {
    create: vi.fn(),
    findByHash: vi.fn(),
    markRotated: vi.fn(),
    revoke: vi.fn(),
    revokeFamily: vi.fn(),
    revokeAllForUser: vi.fn(),
  },
}));
vi.mock('@src/user/user.repository', () => ({
  usersRepository: { findById: vi.fn() },
}));

import { sessionService } from '@src/user/auth/session.service';
import { refreshTokenRepository } from '@src/user/auth/refresh-token.repository';
import { usersRepository } from '@src/user/user.repository';
import type { RefreshTokenRow, UserRow } from '@src/user/user.types';

const create = vi.mocked(refreshTokenRepository.create);
const findByHash = vi.mocked(refreshTokenRepository.findByHash);
const markRotated = vi.mocked(refreshTokenRepository.markRotated);
const revoke = vi.mocked(refreshTokenRepository.revoke);
const revokeFamily = vi.mocked(refreshTokenRepository.revokeFamily);
const revokeAllForUser = vi.mocked(refreshTokenRepository.revokeAllForUser);
const findById = vi.mocked(usersRepository.findById);

const user = (over: Record<string, unknown> = {}): UserRow =>
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

const refreshRow = (over: Record<string, unknown> = {}): RefreshTokenRow =>
  ({
    jti: 'jti-old',
    user_id: 'user-1',
    family_id: 'family-1',
    parent_jti: null,
    token_hash: sha256Hex('plain-token'),
    amr: 'password',
    user_agent: 'UA',
    ip: '127.0.0.1',
    expires_at: new Date(Date.now() + 60_000),
    revoked_at: null,
    revoke_reason: null,
    created_at: new Date(),
    ...over,
  }) as unknown as RefreshTokenRow;

const ctx = { ip: '203.0.113.5', userAgent: 'Mozilla/5.0' };

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue(undefined);
  markRotated.mockResolvedValue(true);
  revoke.mockResolvedValue(undefined);
  revokeFamily.mockResolvedValue(1);
  revokeAllForUser.mockResolvedValue(2);
});

describe('sessionService.start', () => {
  it('用 sessionId 作为 refresh token family，返回明文 token 与过期时间', async () => {
    const started = await sessionService.start(user(), ['password'], ctx);

    expect(create).toHaveBeenCalledTimes(1);
    const created = create.mock.calls[0]![0];

    expect(created.familyId).toBe(started.sessionId);
    expect(created.parentJti).toBeNull();
    expect(created.userId).toBe('user-1');
    expect(created.amr).toBe('password');
    // 库里只存 hash，明文只回给客户端
    expect(created.tokenHash).toBe(sha256Hex(started.refreshToken));
    expect(created.tokenHash).not.toBe(started.refreshToken);
    expect(created.userAgent).toBe('Mozilla/5.0');
    expect(created.ip).toBe('203.0.113.5');
    expect(started.refreshExpiresInSeconds).toBe(env.cookie.refreshTtlSeconds);
    expect(started.refreshExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('amr 为空时兜底成 password（refresh_tokens.amr 不能为空）', async () => {
    await sessionService.start(user(), [], ctx);
    expect(create.mock.calls[0]![0].amr).toBe('password');
  });

  it('超长 user-agent / ip 会截断到库字段上限', async () => {
    await sessionService.start(user(), ['otp'], { ip: '1'.repeat(100), userAgent: 'u'.repeat(400) });
    const created = create.mock.calls[0]![0];
    expect(created.ip).toHaveLength(64);
    expect(created.userAgent).toHaveLength(255);
  });
});

describe('sessionService.rotate', () => {
  it('按 sha256 查 token（不按明文查）', async () => {
    findByHash.mockResolvedValue(null);
    await expect(sessionService.rotate('plain-token', ctx)).rejects.toMatchObject({ status: 401 });
    expect(findByHash).toHaveBeenCalledWith(sha256Hex('plain-token'));
  });

  it('token 不存在 -> invalid_grant', async () => {
    findByHash.mockResolvedValue(null);
    await expect(sessionService.rotate('unknown', ctx)).rejects.toMatchObject({
      status: 401,
      code: 'invalid_grant',
    });
  });

  it('已吊销的 token 被再次使用 -> 判定泄露，吊销整个 family', async () => {
    findByHash.mockResolvedValue(refreshRow({ revoked_at: new Date() }));

    await expect(sessionService.rotate('plain-token', ctx)).rejects.toMatchObject({
      status: 401,
      message: '检测到异常会话，已为你登出，请重新登录',
    });

    expect(revokeFamily).toHaveBeenCalledWith('family-1', 'token_reuse', expect.any(Date));
    expect(create).not.toHaveBeenCalled();
  });

  it('已过期 -> 吊销该 token 并报错', async () => {
    findByHash.mockResolvedValue(refreshRow({ expires_at: new Date(Date.now() - 1000) }));

    await expect(sessionService.rotate('plain-token', ctx)).rejects.toMatchObject({
      status: 401,
      message: '会话已过期，请重新登录',
    });
    expect(revoke).toHaveBeenCalledWith('jti-old', 'expired', expect.any(Date));
  });

  it('用户被禁用 -> 吊销整个 family', async () => {
    findByHash.mockResolvedValue(refreshRow());
    findById.mockResolvedValue(user({ status: 'locked' }));

    await expect(sessionService.rotate('plain-token', ctx)).rejects.toMatchObject({
      status: 401,
      message: '账号状态异常，请联系管理员',
    });
    expect(revokeFamily).toHaveBeenCalledWith('family-1', 'user_inactive', expect.any(Date));
  });

  it('用户已被删除 -> 吊销整个 family', async () => {
    findByHash.mockResolvedValue(refreshRow());
    findById.mockResolvedValue(null);

    await expect(sessionService.rotate('plain-token', ctx)).rejects.toMatchObject({ status: 401 });
    expect(revokeFamily).toHaveBeenCalledWith('family-1', 'user_inactive', expect.any(Date));
  });

  it('并发旋转失败（markRotated=false）-> 吊销 family 并要求重新登录', async () => {
    findByHash.mockResolvedValue(refreshRow());
    findById.mockResolvedValue(user());
    markRotated.mockResolvedValue(false);

    await expect(sessionService.rotate('plain-token', ctx)).rejects.toMatchObject({
      status: 401,
      message: '会话已被更新，请重新登录',
    });
    expect(revokeFamily).toHaveBeenCalledWith('family-1', 'concurrent_rotation', expect.any(Date));
    expect(create).not.toHaveBeenCalled();
  });

  it('旋转成功：旧 token 标记 rotated，新 token 继承 family 且 parentJti 指向旧 jti', async () => {
    findByHash.mockResolvedValue(refreshRow({ amr: 'password,otp' }));
    findById.mockResolvedValue(user());

    const rotated = await sessionService.rotate('plain-token', ctx);

    expect(markRotated).toHaveBeenCalledWith('jti-old', expect.any(Date));
    const created = create.mock.calls[0]![0];
    expect(created).toMatchObject({
      userId: 'user-1',
      familyId: 'family-1',
      parentJti: 'jti-old',
      amr: 'password,otp',
    });
    expect(created.tokenHash).toBe(sha256Hex(rotated.refreshToken));
    expect(rotated).toMatchObject({
      sessionId: 'family-1',
      userId: 'user-1',
      amr: ['password', 'otp'],
      refreshExpiresInSeconds: env.cookie.refreshTtlSeconds,
    });
    expect(rotated.accessJti).toBeTruthy();
    expect(rotated.refreshToken).not.toBe('plain-token');
  });
});

describe('sessionService 吊销接口', () => {
  it('revokeSession 吊销整条 family', async () => {
    await sessionService.revokeSession('family-9', 'logout');
    expect(revokeFamily).toHaveBeenCalledWith('family-9', 'logout', expect.any(Date));
  });

  it('revokeOtherSessions 保留当前会话', async () => {
    await expect(sessionService.revokeOtherSessions('user-1', 'family-9', 'password_changed')).resolves.toBe(2);
    expect(revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      'password_changed',
      expect.any(Date),
      'family-9',
    );
  });
});
