import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@src/config';
import { hmacSha256Hex, normalizeEmail } from '@src/common/crypto';

vi.mock('@src/user/auth/otp.repository', () => ({
  otpRepository: {
    findLatestActive: vi.fn(),
    create: vi.fn(),
    invalidateActive: vi.fn(),
    incrementAttempts: vi.fn(),
    consume: vi.fn(),
  },
}));
vi.mock('@src/user/auth/mail.service', () => ({
  mailService: { sendOtp: vi.fn(), sendNotice: vi.fn() },
}));
vi.mock('@src/common/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { otpService } from '@src/user/auth/otp.service';
import { otpRepository } from '@src/user/auth/otp.repository';
import { mailService } from '@src/user/auth/mail.service';
import type { OtpChallengeRow } from '@src/user/user.types';

const findLatestActive = vi.mocked(otpRepository.findLatestActive);
const create = vi.mocked(otpRepository.create);
const invalidateActive = vi.mocked(otpRepository.invalidateActive);
const incrementAttempts = vi.mocked(otpRepository.incrementAttempts);
const consume = vi.mocked(otpRepository.consume);
const sendOtp = vi.mocked(mailService.sendOtp);

const EMAIL = 'Student@Example.com';
const NORMALIZED = normalizeEmail(EMAIL);

const challenge = (over: Record<string, unknown> = {}): OtpChallengeRow =>
  ({
    id: 'otp-1',
    email: NORMALIZED,
    user_id: 'user-1',
    purpose: 'logon',
    code_hash: '',
    attempts: 0,
    max_attempts: env.otp.maxAttempts,
    expires_at: new Date(Date.now() + 60_000),
    consumed_at: null,
    request_ip: '127.0.0.1',
    created_at: new Date(),
    ...over,
  }) as unknown as OtpChallengeRow;

const expectedHash = (purpose: string, code: string): string =>
  hmacSha256Hex(env.otp.secret, `${purpose}:${NORMALIZED}:${code}`);

beforeEach(() => {
  vi.clearAllMocks();
  invalidateActive.mockResolvedValue(undefined);
  create.mockResolvedValue(challenge());
  sendOtp.mockResolvedValue(undefined);
  consume.mockResolvedValue(true);
});

describe('otpService.issue', () => {
  it('把邮箱归一化后落库，验证码只存 HMAC 不存明文', async () => {
    findLatestActive.mockResolvedValue(null);

    const result = await otpService.issue({
      email: EMAIL,
      purpose: 'logon',
      userId: null,
      ip: '203.0.113.9',
    });

    expect(findLatestActive).toHaveBeenCalledWith(NORMALIZED, 'logon');
    expect(invalidateActive).toHaveBeenCalledWith(NORMALIZED, 'logon', expect.any(Date));
    expect(create).toHaveBeenCalledTimes(1);

    const created = create.mock.calls[0]![0];
    expect(created).toMatchObject({
      email: NORMALIZED,
      userId: null,
      purpose: 'logon',
      maxAttempts: env.otp.maxAttempts,
      requestIp: '203.0.113.9',
    });
    expect(created.codeHash).toMatch(/^[0-9a-f]{64}$/);

    // 发给用户的验证码是 6 位数字，且 hash 与之一致
    const mailed = sendOtp.mock.calls[0]![0];
    expect(mailed.to).toBe(NORMALIZED);
    expect(mailed.code).toMatch(new RegExp(`^\\d{${env.otp.length}}$`));
    expect(mailed.expiresInMinutes).toBe(Math.round(env.otp.ttlSeconds / 60));
    expect(created.codeHash).toBe(expectedHash('logon', mailed.code));

    expect(result.expiresInSeconds).toBe(env.otp.ttlSeconds);
    expect(result.expiresAt.getTime()).toBeCloseTo(
      Date.now() + env.otp.ttlSeconds * 1000,
      -4,
    );
  });

  it('重发冷却期内 -> 429，并给出合理的 retryAfterSeconds', async () => {
    findLatestActive.mockResolvedValue(challenge({ created_at: new Date(Date.now() - 10_000) }));

    await expect(
      otpService.issue({ email: EMAIL, purpose: 'logon', userId: null, ip: null }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
      details: { retryAfterSeconds: expect.any(Number) },
    });

    const error = (await otpService
      .issue({ email: EMAIL, purpose: 'logon', userId: null, ip: null })
      .catch((e: unknown) => e)) as unknown as { details: { retryAfterSeconds: number } };
    expect(error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(error.details.retryAfterSeconds).toBeLessThanOrEqual(env.otp.resendCooldownSeconds);
    expect(create).not.toHaveBeenCalled();
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('冷却期已过可以重发，并先作废旧码', async () => {
    findLatestActive.mockResolvedValue(
      challenge({ created_at: new Date(Date.now() - (env.otp.resendCooldownSeconds + 5) * 1000) }),
    );

    await otpService.issue({ email: EMAIL, purpose: 'logon', userId: null, ip: null });

    expect(invalidateActive).toHaveBeenCalledWith(NORMALIZED, 'logon', expect.any(Date));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('邮件发送失败 -> 作废验证码并抛错（避免用户拿到收不到的码）', async () => {
    findLatestActive.mockResolvedValue(null);
    sendOtp.mockRejectedValue(new Error('smtp down'));

    await expect(
      otpService.issue({ email: EMAIL, purpose: 'verify_email', userId: 'user-1', ip: null }),
    ).rejects.toThrow('邮件发送失败，请稍后重试');

    // 一次是发码前作废旧码，一次是失败后回滚刚创建的码
    expect(invalidateActive).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('otpService.verify', () => {
  it('没有有效挑战码 -> 401 invalid_grant', async () => {
    findLatestActive.mockResolvedValue(null);
    await expect(
      otpService.verify({ email: EMAIL, purpose: 'logon', code: '123456' }),
    ).rejects.toMatchObject({ status: 401, code: 'invalid_grant' });
    expect(consume).not.toHaveBeenCalled();
  });

  it('已过期 -> 消费掉并报错', async () => {
    findLatestActive.mockResolvedValue(challenge({ expires_at: new Date(Date.now() - 1000) }));
    await expect(
      otpService.verify({ email: EMAIL, purpose: 'logon', code: '123456' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(consume).toHaveBeenCalledWith('otp-1', expect.any(Date));
  });

  it('尝试次数已用尽 -> 消费掉并报错', async () => {
    findLatestActive.mockResolvedValue(challenge({ attempts: env.otp.maxAttempts }));
    await expect(
      otpService.verify({ email: EMAIL, purpose: 'logon', code: '123456' }),
    ).rejects.toMatchObject({ status: 401, message: '验证码尝试次数过多，请重新获取' });
    expect(consume).toHaveBeenCalled();
    expect(incrementAttempts).not.toHaveBeenCalled();
  });

  it('验证码不正确 -> 先计数再报错，次数未用完则不消费', async () => {
    findLatestActive.mockResolvedValue(challenge({ code_hash: expectedHash('logon', '111111') }));
    incrementAttempts.mockResolvedValue(1);

    await expect(
      otpService.verify({ email: EMAIL, purpose: 'logon', code: '222222' }),
    ).rejects.toMatchObject({ status: 401, code: 'invalid_grant' });

    expect(incrementAttempts).toHaveBeenCalledWith('otp-1');
    expect(consume).not.toHaveBeenCalled();
  });

  it('错误验证码恰好用掉最后一次机会 -> 消费掉', async () => {
    findLatestActive.mockResolvedValue(challenge({ code_hash: expectedHash('logon', '111111') }));
    incrementAttempts.mockResolvedValue(env.otp.maxAttempts);

    await expect(
      otpService.verify({ email: EMAIL, purpose: 'logon', code: '222222' }),
    ).rejects.toMatchObject({ status: 401 });

    expect(consume).toHaveBeenCalledWith('otp-1', expect.any(Date));
  });

  it('验证码正确 -> 原子消费成功并返回挑战记录', async () => {
    const row = challenge({ code_hash: expectedHash('logon', '654321') });
    findLatestActive.mockResolvedValue(row);
    incrementAttempts.mockResolvedValue(1);
    consume.mockResolvedValue(true);

    const result = await otpService.verify({ email: EMAIL, purpose: 'logon', code: '654321' });

    expect(result).toBe(row);
    expect(consume).toHaveBeenCalledWith('otp-1', expect.any(Date));
    expect(findLatestActive).toHaveBeenCalledWith(NORMALIZED, 'logon');
  });

  it('并发提交时另一个请求已消费 -> 提示已被使用', async () => {
    findLatestActive.mockResolvedValue(challenge({ code_hash: expectedHash('logon', '654321') }));
    incrementAttempts.mockResolvedValue(1);
    consume.mockResolvedValue(false);

    await expect(
      otpService.verify({ email: EMAIL, purpose: 'logon', code: '654321' }),
    ).rejects.toMatchObject({ status: 401, message: '验证码已被使用，请重新获取' });
  });

  it('hash 与 purpose 绑定：同一验证码换场景无效', async () => {
    findLatestActive.mockResolvedValue(challenge({ code_hash: expectedHash('logon', '654321') }));
    incrementAttempts.mockResolvedValue(1);

    await expect(
      otpService.verify({ email: EMAIL, purpose: 'verify_email', code: '654321' }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
