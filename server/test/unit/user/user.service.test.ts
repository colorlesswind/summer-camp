import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@src/common/http';
import type { AuthContext, IdentityRow, OtpChallengeRow, UserRow } from '@src/user/user.types';
import type { LogonInput } from '@src/user/user.schema';

vi.mock('@src/infra/rate-limit.store', () => ({
  rateLimitStore: { consume: vi.fn(), clear: vi.fn() },
}));
vi.mock('@src/infra/audit.log', () => ({
  auditLog: { write: vi.fn() },
}));
vi.mock('@src/user/user.repository', () => ({
  usersRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    markEmailVerified: vi.fn(),
    touch: vi.fn(),
  },
  passwordRepository: { getHash: vi.fn(), upsert: vi.fn(), remove: vi.fn() },
}));
vi.mock('@src/user/identity.repository', () => ({
  identitiesRepository: { listByUser: vi.fn() },
}));
vi.mock('@src/user/auth/password.service', () => ({
  passwordService: { hash: vi.fn(), verify: vi.fn(), dummyVerify: vi.fn() },
}));
vi.mock('@src/user/auth/otp.service', () => ({
  otpService: { issue: vi.fn(), verify: vi.fn(), expiresInSeconds: 3600 },
}));
vi.mock('@src/user/auth/session.service', () => ({
  sessionService: { start: vi.fn(), rotate: vi.fn(), revokeSession: vi.fn(), revokeOtherSessions: vi.fn() },
}));
vi.mock('@src/user/auth/token.service', () => ({
  tokenService: { signAccessToken: vi.fn() },
}));
vi.mock('@src/user/auth/denylist.repository', () => ({
  jwtDenylistRepository: { revoke: vi.fn() },
}));
vi.mock('@src/user/auth/mail.service', () => ({
  mailService: { sendOtp: vi.fn(), sendNotice: vi.fn() },
}));

import { userService } from '@src/user/user.service';
import { rateLimitStore } from '@src/infra/rate-limit.store';
import { auditLog } from '@src/infra/audit.log';
import { usersRepository, passwordRepository } from '@src/user/user.repository';
import { identitiesRepository } from '@src/user/identity.repository';
import { passwordService } from '@src/user/auth/password.service';
import { otpService } from '@src/user/auth/otp.service';
import { sessionService } from '@src/user/auth/session.service';
import { tokenService } from '@src/user/auth/token.service';
import { jwtDenylistRepository } from '@src/user/auth/denylist.repository';
import { mailService } from '@src/user/auth/mail.service';

const consume = vi.mocked(rateLimitStore.consume);
const clearRateLimit = vi.mocked(rateLimitStore.clear);
const auditWrite = vi.mocked(auditLog.write);
const findByEmail = vi.mocked(usersRepository.findByEmail);
const findById = vi.mocked(usersRepository.findById);
const createUser = vi.mocked(usersRepository.create);
const markEmailVerified = vi.mocked(usersRepository.markEmailVerified);
const getHash = vi.mocked(passwordRepository.getHash);
const upsertPassword = vi.mocked(passwordRepository.upsert);
const listIdentities = vi.mocked(identitiesRepository.listByUser);
const hashPassword = vi.mocked(passwordService.hash);
const verifyPassword = vi.mocked(passwordService.verify);
const dummyVerify = vi.mocked(passwordService.dummyVerify);
const issueOtp = vi.mocked(otpService.issue);
const verifyOtp = vi.mocked(otpService.verify);
const startSession = vi.mocked(sessionService.start);
const rotateSession = vi.mocked(sessionService.rotate);
const revokeSession = vi.mocked(sessionService.revokeSession);
const revokeOtherSessions = vi.mocked(sessionService.revokeOtherSessions);
const signAccessToken = vi.mocked(tokenService.signAccessToken);
const revokeJti = vi.mocked(jwtDenylistRepository.revoke);
const sendNotice = vi.mocked(mailService.sendNotice);

const ctx: RequestContext = { ip: '203.0.113.5', userAgent: 'vitest-agent' };

const userRow = (over: Record<string, unknown> = {}): UserRow =>
  ({
    id: 'user-1',
    primary_email: 'student@example.com',
    display_name: 'Alice',
    email_verified_at: new Date('2026-01-01T00:00:00.000Z'),
    status: 'active',
    role: 'student',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-02T00:00:00.000Z'),
    ...over,
  }) as unknown as UserRow;

const authContext = (over: Partial<AuthContext> = {}): AuthContext => ({
  userId: 'user-1',
  role: 'student',
  jti: 'jti-1',
  sessionId: 'session-1',
  amr: ['password'],
  expiresAt: 1_800_000_000,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue({ allowed: true, count: 1, remaining: 9, retryAfterSeconds: 0 });
  clearRateLimit.mockResolvedValue(undefined);
  auditWrite.mockResolvedValue(undefined);
  findByEmail.mockResolvedValue(null);
  findById.mockResolvedValue(userRow());
  createUser.mockResolvedValue(userRow());
  markEmailVerified.mockResolvedValue(undefined);
  getHash.mockResolvedValue('$2a$10$hash');
  upsertPassword.mockResolvedValue(undefined);
  listIdentities.mockResolvedValue([]);
  hashPassword.mockResolvedValue('$2a$10$new-hash');
  verifyPassword.mockResolvedValue(true);
  dummyVerify.mockResolvedValue(undefined);
  issueOtp.mockResolvedValue({ expiresAt: new Date(), expiresInSeconds: 3600 });
  verifyOtp.mockResolvedValue({
    id: 'otp-1',
    email: 'student@example.com',
    user_id: 'user-1',
    purpose: 'logon',
    code_hash: 'hash',
    attempts: 1,
    max_attempts: 5,
    expires_at: new Date(),
    consumed_at: null,
    request_ip: null,
    created_at: new Date(),
  } as unknown as OtpChallengeRow);
  startSession.mockResolvedValue({
    sessionId: 'session-1',
    refreshToken: 'refresh-token',
    refreshExpiresAt: new Date(Date.now() + 60_000),
    refreshExpiresInSeconds: 604800,
  });
  rotateSession.mockResolvedValue({
    sessionId: 'session-1',
    userId: 'user-1',
    amr: ['password'],
    accessJti: 'jti-new',
    refreshToken: 'rotated-refresh-token',
    refreshExpiresAt: new Date(Date.now() + 60_000),
    refreshExpiresInSeconds: 604800,
  });
  revokeSession.mockResolvedValue(undefined);
  revokeOtherSessions.mockResolvedValue(3);
  revokeJti.mockResolvedValue(undefined);
  signAccessToken.mockReturnValue({
    token: 'access-token',
    jti: 'jti-1',
    expiresAt: new Date(),
    expiresInSeconds: 900,
  });
  sendNotice.mockResolvedValue(undefined);
});

describe('userService.register', () => {
  const input = { email: ' Student@Example.com ', password: 'password1' };

  it('新邮箱：建号 + 发验证码 + 审计 success', async () => {
    const result = await userService.register(input, ctx);

    expect(result).toEqual({ accepted: true });
    expect(findByEmail).toHaveBeenCalledWith('student@example.com');
    expect(hashPassword).toHaveBeenCalledWith('password1');
    expect(createUser).toHaveBeenCalledWith({
      email: 'student@example.com',
      passwordHash: '$2a$10$new-hash',
      displayName: null,
    });
    expect(issueOtp).toHaveBeenCalledWith({
      email: 'student@example.com',
      purpose: 'verify_email',
      userId: 'user-1',
      ip: ctx.ip,
    });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'register', result: 'success', userId: 'user-1' }),
    );
  });

  it('已注册但未验证：重发验证码，不覆盖密码、不新建账号', async () => {
    findByEmail.mockResolvedValue(userRow({ email_verified_at: null }));

    await expect(userService.register(input, ctx)).resolves.toEqual({ accepted: true });

    expect(createUser).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(issueOtp).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'verify_email', userId: 'user-1' }),
    );
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'register', result: 'duplicate' }),
    );
  });

  it('已注册且已验证：只发「该邮箱已注册」提示邮件', async () => {
    findByEmail.mockResolvedValue(userRow());

    await userService.register(input, ctx);

    expect(issueOtp).not.toHaveBeenCalled();
    expect(sendNotice).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'student@example.com', subject: expect.stringContaining('已注册') }),
    );
  });

  it('提示邮件失败不影响 202 响应（注册接口不能因邮件挂掉而 500）', async () => {
    findByEmail.mockResolvedValue(userRow());
    sendNotice.mockRejectedValue(new Error('smtp down'));

    await expect(userService.register(input, ctx)).resolves.toEqual({ accepted: true });
  });

  it('发验证码失败也不抛错（用户重新注册即可重发）', async () => {
    issueOtp.mockRejectedValue(new Error('429 or smtp'));

    await expect(userService.register(input, ctx)).resolves.toEqual({ accepted: true });
    expect(createUser).toHaveBeenCalled();
  });

  it('触发限流 -> 429，且不做任何写库操作', async () => {
    consume.mockResolvedValue({ allowed: false, count: 11, remaining: 0, retryAfterSeconds: 900 });

    await expect(userService.register(input, ctx)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
    });
    expect(findByEmail).not.toHaveBeenCalled();
  });

  it('IP 与邮箱各用一个限流桶', async () => {
    await userService.register(input, ctx);
    const buckets = consume.mock.calls.map((call) => call[0]);
    expect(buckets).toEqual(['register:ip:203.0.113.5', 'register:email:student@example.com']);
  });
});

describe('userService.verifyEmail', () => {
  it('验证通过后标记邮箱已验证并记审计', async () => {
    findByEmail.mockResolvedValue(userRow({ email_verified_at: null }));

    await expect(
      userService.verifyEmail({ email: ' Student@Example.com ', code: '123456' }, ctx),
    ).resolves.toEqual({ verified: true });

    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'student@example.com',
      purpose: 'verify_email',
      code: '123456',
    });
    expect(markEmailVerified).toHaveBeenCalledWith('user-1', expect.any(Date));
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'verify_email', result: 'success' }),
    );
  });

  it('发码后用户被删除 -> 401（不泄露用户是否存在）', async () => {
    findByEmail.mockResolvedValue(null);
    await expect(userService.verifyEmail({ email: 'a@b.com', code: '123456' }, ctx)).rejects.toMatchObject({
      status: 401,
      code: 'invalid_grant',
    });
    expect(markEmailVerified).not.toHaveBeenCalled();
  });

  it('验证码错误时把 otpService 的错误原样抛出', async () => {
    verifyOtp.mockRejectedValue(new (await import('@src/common/errors')).AppError(401, 'invalid_grant', '验证码无效或已过期'));
    await expect(userService.verifyEmail({ email: 'a@b.com', code: '000000' }, ctx)).rejects.toMatchObject({
      status: 401,
      code: 'invalid_grant',
    });
  });
});

describe('userService.requestOtp', () => {
  it('purpose=logon 且邮箱未注册：发码并记录 isNewUser', async () => {
    await expect(userService.requestOtp({ email: 'New@Example.com', purpose: 'logon' }, ctx)).resolves.toEqual({
      accepted: true,
      expiresInSeconds: 3600,
    });

    expect(issueOtp).toHaveBeenCalledWith({
      email: 'new@example.com',
      purpose: 'logon',
      userId: null,
      ip: ctx.ip,
    });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'otp_request', result: 'success', meta: { purpose: 'logon', isNewUser: true } }),
    );
  });

  it('purpose=logon 且邮箱已注册：带上 userId', async () => {
    findByEmail.mockResolvedValue(userRow());
    await userService.requestOtp({ email: 'student@example.com', purpose: 'logon' }, ctx);
    expect(issueOtp).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
  });

  it('purpose=verify_email 且未验证：重发验证邮件', async () => {
    findByEmail.mockResolvedValue(userRow({ email_verified_at: null }));
    await userService.requestOtp({ email: 'student@example.com', purpose: 'verify_email' }, ctx);
    expect(issueOtp).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'verify_email' }));
  });

  it('purpose=verify_email 但已验证 / 不存在：静默 202，不发码（防邮箱枚举）', async () => {
    findByEmail.mockResolvedValue(userRow());
    await expect(
      userService.requestOtp({ email: 'student@example.com', purpose: 'verify_email' }, ctx),
    ).resolves.toEqual({ accepted: true, expiresInSeconds: 3600 });
    expect(issueOtp).not.toHaveBeenCalled();

    findByEmail.mockResolvedValue(null);
    await userService.requestOtp({ email: 'ghost@example.com', purpose: 'verify_email' }, ctx);
    expect(issueOtp).not.toHaveBeenCalled();
  });

  it('限流 -> 429', async () => {
    consume.mockResolvedValue({ allowed: false, count: 31, remaining: 0, retryAfterSeconds: 60 });
    await expect(userService.requestOtp({ email: 'a@b.com', purpose: 'logon' }, ctx)).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe('userService.logon（password grant）', () => {
  const input: LogonInput = { grant_type: 'password', email: 'Student@Example.com', password: 'password1' };

  it('成功：校验密码、清失败计数、签发会话、返回 profile', async () => {
    findByEmail.mockResolvedValue(userRow());

    const result = await userService.logon(input, ctx);

    expect(verifyPassword).toHaveBeenCalledWith('$2a$10$hash', 'password1');
    expect(clearRateLimit).toHaveBeenCalledWith('logon:email:student@example.com');
    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), ['password'], ctx);
    expect(signAccessToken).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
      amr: ['password'],
    });
    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresInSeconds: 900,
      refreshExpiresInSeconds: 604800,
      user: { id: 'user-1', email: 'student@example.com', role: 'student', emailVerified: true },
    });
  });

  it('密码错误：统一 invalid_grant，并记录 bad_password 审计', async () => {
    findByEmail.mockResolvedValue(userRow());
    verifyPassword.mockResolvedValue(false);

    await expect(userService.logon(input, ctx)).rejects.toMatchObject({
      status: 401,
      code: 'invalid_grant',
      message: '邮箱或密码不正确',
    });
    expect(startSession).not.toHaveBeenCalled();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'logon',
        result: 'failure',
        meta: { grant: 'password', reason: 'bad_password' },
      }),
    );
  });

  it('账号不存在：也跑一次 dummyVerify 抹平时序，错误与密码错误一致', async () => {
    findByEmail.mockResolvedValue(null);

    await expect(userService.logon(input, ctx)).rejects.toMatchObject({
      status: 401,
      message: '邮箱或密码不正确',
    });
    expect(dummyVerify).toHaveBeenCalledTimes(1);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('账号存在但没有密码：同样走 dummyVerify', async () => {
    findByEmail.mockResolvedValue(userRow());
    getHash.mockResolvedValue(null);

    await expect(userService.logon(input, ctx)).rejects.toMatchObject({ status: 401 });
    expect(dummyVerify).toHaveBeenCalledTimes(1);
  });

  it('账号被禁用：403（密码正确也不放行）', async () => {
    findByEmail.mockResolvedValue(userRow({ status: 'locked' }));
    await expect(userService.logon(input, ctx)).rejects.toMatchObject({
      status: 403,
      message: '账号已被禁用，请联系管理员',
    });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('邮箱未验证：403 email_unverified，前端据此引导去验证', async () => {
    findByEmail.mockResolvedValue(userRow({ email_verified_at: null }));
    await expect(userService.logon(input, ctx)).rejects.toMatchObject({
      status: 403,
      code: 'email_unverified',
    });
  });

  it('触发限流：不查库、不比对密码', async () => {
    consume.mockResolvedValue({ allowed: false, count: 11, remaining: 0, retryAfterSeconds: 300 });
    await expect(userService.logon(input, ctx)).rejects.toMatchObject({ status: 429 });
    expect(findByEmail).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });
});

describe('userService.logon（otp grant）', () => {
  const input: LogonInput = { grant_type: 'otp', email: 'Student@Example.com', otp: '123456' };

  it('已有账号：用 otp 作为 amr 签发会话', async () => {
    findByEmail.mockResolvedValue(userRow());

    const result = await userService.logon(input, ctx);

    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'student@example.com',
      purpose: 'logon',
      code: '123456',
    });
    expect(startSession).toHaveBeenCalledWith(expect.anything(), ['otp'], ctx);
    expect(result.user.email).toBe('student@example.com');
  });

  it('挑战码记录了 userId 时优先用 findById', async () => {
    findById.mockResolvedValue(userRow());
    await userService.logon(input, ctx);
    expect(findById).toHaveBeenCalledWith('user-1');
    expect(findByEmail).not.toHaveBeenCalled();
  });

  it('首次邮箱登录：自动开户，并把邮箱标记为已验证', async () => {
    verifyOtp.mockResolvedValue({
      id: 'otp-1',
      email: 'student@example.com',
      user_id: null,
      purpose: 'logon',
      code_hash: 'hash',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(),
      consumed_at: null,
      request_ip: null,
      created_at: new Date(),
    } as unknown as OtpChallengeRow);
    findByEmail.mockResolvedValue(null);
    createUser.mockResolvedValue(userRow({ email_verified_at: new Date() }));

    await userService.logon(input, ctx);

    expect(createUser).toHaveBeenCalledWith({
      email: 'student@example.com',
      emailVerifiedAt: expect.any(Date),
    });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'register', meta: { via: 'otp_signup' } }),
    );
  });

  it('并发下另一个请求刚建好账号（409）：回查后继续登录', async () => {
    verifyOtp.mockResolvedValue({
      id: 'otp-1',
      email: 'student@example.com',
      user_id: null,
      purpose: 'logon',
      code_hash: 'hash',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(),
      consumed_at: null,
      request_ip: null,
      created_at: new Date(),
    } as unknown as OtpChallengeRow);
    findByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(userRow());
    const { conflict } = await import('@src/common/errors');
    createUser.mockRejectedValue(conflict('该邮箱已被注册', { code: 'email_taken' }));

    const result = await userService.logon(input, ctx);
    expect(result.user.id).toBe('user-1');
  });

  it('账号被禁用：403', async () => {
    findById.mockResolvedValue(null);
    findByEmail.mockResolvedValue(userRow({ status: 'locked' }));
    await expect(userService.logon(input, ctx)).rejects.toMatchObject({ status: 403 });
  });

  it('未验证邮箱：验证码登录本身即证明归属，自动标记已验证', async () => {
    findById.mockResolvedValue(userRow({ email_verified_at: null }));
    findByEmail.mockResolvedValue(userRow({ email_verified_at: null }));
    await userService.logon(input, ctx);
    expect(markEmailVerified).toHaveBeenCalledWith('user-1', expect.any(Date));
  });
});

describe('userService.refresh', () => {
  it('缺少 refresh token -> 401', async () => {
    await expect(userService.refresh(undefined, ctx)).rejects.toMatchObject({
      status: 401,
      code: 'invalid_grant',
    });
  });

  it('旋转成功：用新会话签发 access token', async () => {
    const result = await userService.refresh('presented-token', ctx);

    expect(rotateSession).toHaveBeenCalledWith('presented-token', ctx);
    expect(signAccessToken).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
      amr: ['password'],
    });
    expect(result).toMatchObject({ accessToken: 'access-token', refreshToken: 'rotated-refresh-token' });
  });

  it('旋转后用户已不可用 -> 401', async () => {
    findById.mockResolvedValue(userRow({ status: 'locked' }));
    await expect(userService.refresh('presented-token', ctx)).rejects.toMatchObject({ status: 401 });
  });
});

describe('userService.logout', () => {
  it('吊销 refresh family，并把当前 access token 的 jti 拉黑到过期时刻', async () => {
    await userService.logout(authContext(), ctx);

    expect(revokeSession).toHaveBeenCalledWith('session-1', 'logout');
    expect(revokeJti).toHaveBeenCalledWith({
      jti: 'jti-1',
      userId: 'user-1',
      reason: 'logout',
      expiresAt: new Date(1_800_000_000 * 1000),
    });
    expect(auditWrite).toHaveBeenCalledWith(expect.objectContaining({ event: 'logout', result: 'success' }));
  });
});

describe('userService.me', () => {
  it('返回 profile 与已绑定的第三方身份', async () => {
    listIdentities.mockResolvedValue([
      {
        id: 'identity-1',
        user_id: 'user-1',
        provider: 'github',
        provider_user_id: '42',
        email_at_provider: 'gh@example.com',
        profile_json: null,
        created_at: new Date('2026-02-01T00:00:00.000Z'),
        updated_at: new Date('2026-02-01T00:00:00.000Z'),
      } as IdentityRow,
    ]);

    const result = await userService.me('user-1');

    expect(result.user).toMatchObject({ id: 'user-1', email: 'student@example.com' });
    expect(result.identities).toEqual([
      { provider: 'github', email: 'gh@example.com', createdAt: '2026-02-01T00:00:00.000Z' },
    ]);
  });

  it('用户不可用 -> 401', async () => {
    findById.mockResolvedValue(null);
    await expect(userService.me('user-1')).rejects.toMatchObject({ status: 401 });
  });
});

describe('userService.changePassword', () => {
  const input = { currentPassword: 'old-password', newPassword: 'new-password-1' };

  it('已有密码且校验通过：写新 hash + 踢掉其它会话', async () => {
    const result = await userService.changePassword(authContext(), input, ctx);

    expect(verifyPassword).toHaveBeenCalledWith('$2a$10$hash', 'old-password');
    expect(hashPassword).toHaveBeenCalledWith('new-password-1');
    expect(upsertPassword).toHaveBeenCalledWith('user-1', '$2a$10$new-hash');
    expect(revokeOtherSessions).toHaveBeenCalledWith('user-1', 'session-1', 'password_changed');
    expect(result).toEqual({ revokedSessions: 3 });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'password_change', result: 'success', meta: { revokedSessions: 3 } }),
    );
  });

  it('已有密码但没提供当前密码 -> 400', async () => {
    await expect(
      userService.changePassword(authContext(), { newPassword: 'new-password-1' }, ctx),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_request' });
    expect(upsertPassword).not.toHaveBeenCalled();
  });

  it('当前密码错误 -> 401 invalid_grant + 失败审计', async () => {
    verifyPassword.mockResolvedValue(false);

    await expect(userService.changePassword(authContext(), input, ctx)).rejects.toMatchObject({
      status: 401,
      message: '当前密码不正确',
    });
    expect(upsertPassword).not.toHaveBeenCalled();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'password_change', result: 'failure' }),
    );
  });

  it('无密码账号：本次会话必须是 OTP 登录，否则 403', async () => {
    getHash.mockResolvedValue(null);

    await expect(
      userService.changePassword(authContext({ amr: ['password'] }), { newPassword: 'new-password-1' }, ctx),
    ).rejects.toMatchObject({
      status: 403,
      message: '请先使用邮箱验证码登录后再设置密码',
    });
    expect(upsertPassword).not.toHaveBeenCalled();
  });

  it('无密码账号 + OTP 会话：允许首次设置密码', async () => {
    getHash.mockResolvedValue(null);

    await expect(
      userService.changePassword(authContext({ amr: ['otp'] }), { newPassword: 'new-password-1' }, ctx),
    ).resolves.toEqual({ revokedSessions: 3 });
    expect(upsertPassword).toHaveBeenCalledWith('user-1', '$2a$10$new-hash');
  });

  it('用户不可用 -> 401', async () => {
    findById.mockResolvedValue(null);
    await expect(userService.changePassword(authContext(), input, ctx)).rejects.toMatchObject({ status: 401 });
  });
});
