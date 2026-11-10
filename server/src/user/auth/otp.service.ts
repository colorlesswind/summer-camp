import { env } from '../../config';
import { hmacSha256Hex, normalizeEmail, randomNumericCode, timingSafeEqual } from '../../common/crypto';
import { tooManyRequests, invalidGrant } from '../../common/errors';
import { logger } from '../../common/logger';
import { otpRepository } from './otp.repository';
import { mailService } from './mail.service';
import type { OtpChallengeRow, OtpPurpose } from '../user.types';

/**
 * 验证码不落明文：HMAC(secret, purpose:email:code)。
 * 即使库被拖走，没有 OTP_SECRET 也无法反推验证码。
 */
const hashCode = (purpose: OtpPurpose, email: string, code: string): string =>
  hmacSha256Hex(env.otp.secret, `${purpose}:${normalizeEmail(email)}:${code}`);

export interface IssueOtpInput {
  email: string;
  purpose: OtpPurpose;
  userId: string | null;
  ip: string | null;
}

export interface IssueOtpResult {
  expiresAt: Date;
  expiresInSeconds: number;
}

export interface VerifyOtpInput {
  email: string;
  purpose: OtpPurpose;
  code: string;
}

export const otpService = {
  /** 验证码有效期（秒），供接口响应直接使用 */
  expiresInSeconds: env.otp.ttlSeconds,

  async issue(input: IssueOtpInput): Promise<IssueOtpResult> {
    const email = normalizeEmail(input.email);

    const previous = await otpRepository.findLatestActive(email, input.purpose);
    if (previous) {
      const elapsedMs = Date.now() - previous.created_at.getTime();
      const cooldownMs = env.otp.resendCooldownSeconds * 1000;
      if (elapsedMs < cooldownMs) {
        throw tooManyRequests(
          '验证码发送过于频繁，请稍后再试',
          Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000)),
        );
      }
    }

    const code = randomNumericCode(env.otp.length);
    const expiresAt = new Date(Date.now() + env.otp.ttlSeconds * 1000);

    // 旧码立即作废：保证同场景下只有一个有效验证码
    await otpRepository.invalidateActive(email, input.purpose, new Date());
    await otpRepository.create({
      email,
      userId: input.userId,
      purpose: input.purpose,
      codeHash: hashCode(input.purpose, email, code),
      maxAttempts: env.otp.maxAttempts,
      expiresAt,
      requestIp: input.ip,
    });

    try {
      await mailService.sendOtp({
        to: email,
        code,
        purpose: input.purpose,
        expiresInMinutes: Math.round(env.otp.ttlSeconds / 60),
      });
    } catch (error) {
      // 邮件投递失败要把挑战码一起作废，避免用户拿到一个永远收不到的验证码
      logger.error({ err: error, purpose: input.purpose }, 'send otp mail failed');
      await otpRepository.invalidateActive(email, input.purpose, new Date());
      throw new Error('邮件发送失败，请稍后重试');
    }

    return { expiresAt, expiresInSeconds: env.otp.ttlSeconds };
  },

  async verify(input: VerifyOtpInput): Promise<OtpChallengeRow> {
    const email = normalizeEmail(input.email);
    const challenge = await otpRepository.findLatestActive(email, input.purpose);

    if (!challenge) {
      throw invalidGrant('验证码无效或已过期');
    }

    if (challenge.expires_at.getTime() <= Date.now()) {
      await otpRepository.consume(challenge.id, new Date());
      throw invalidGrant('验证码无效或已过期');
    }

    if (challenge.attempts >= challenge.max_attempts) {
      await otpRepository.consume(challenge.id, new Date());
      throw invalidGrant('验证码尝试次数过多，请重新获取');
    }

    const attempts = await otpRepository.incrementAttempts(challenge.id);
    const matched = timingSafeEqual(hashCode(input.purpose, email, input.code), challenge.code_hash);

    if (!matched) {
      if (attempts >= challenge.max_attempts) {
        await otpRepository.consume(challenge.id, new Date());
      }
      throw invalidGrant('验证码无效或已过期');
    }

    const consumed = await otpRepository.consume(challenge.id, new Date());
    if (!consumed) {
      // 并发提交：另一个请求已经用掉了这个码
      throw invalidGrant('验证码已被使用，请重新获取');
    }

    return challenge;
  },
};
