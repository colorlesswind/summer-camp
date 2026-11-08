import { AppError, badRequest, forbidden, invalidGrant, tooManyRequests, unauthorized } from '../common/errors';
import { normalizeEmail } from '../common/crypto';
import type { RequestContext } from '../common/http';
import { rateLimitStore } from '../infra/rate-limit.store';
import { auditLog } from '../infra/audit.log';
import { usersRepository, passwordRepository } from './user.repository';
import { identitiesRepository } from './identity.repository';
import { passwordService } from './auth/password.service';
import { otpService } from './auth/otp.service';
import { sessionService } from './auth/session.service';
import { tokenService } from './auth/token.service';
import { jwtDenylistRepository } from './auth/denylist.repository';
import { mailService } from './auth/mail.service';
import type { AuthContext, AuthMethod, LinkedIdentity, UserProfile, UserRow } from './user.types';
import { toUserProfile } from './user.types';
import type { ChangePasswordInput, LogonInput, OtpRequestInput, RegisterInput, VerifyEmailInput } from './user.schema';

export interface LogonResult {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
  user: UserProfile;
}

const enforceRateLimit = async (
  bucket: string,
  limit: number,
  windowSeconds: number,
  message: string,
): Promise<void> => {
  const result = await rateLimitStore.consume(bucket, limit, windowSeconds);
  if (!result.allowed) {
    throw tooManyRequests(message, result.retryAfterSeconds);
  }
};

/** 供 OAuth 流程复用：拿到 user 之后统一走这里签发会话 */
export const issueSession = async (
  user: UserRow,
  amr: AuthMethod[],
  ctx: RequestContext,
): Promise<LogonResult> => {
  const session = await sessionService.start(user, amr, ctx);
  const access = tokenService.signAccessToken({
    userId: user.id,
    sessionId: session.sessionId,
    amr,
  });

  return {
    accessToken: access.token,
    refreshToken: session.refreshToken,
    accessExpiresInSeconds: access.expiresInSeconds,
    refreshExpiresInSeconds: session.refreshExpiresInSeconds,
    user: toUserProfile(user),
  };
};

/**
 * 注册后立即发一封「验证邮箱」的验证码。
 * 注意：邮件发送失败不要向上抛异常，否则会出现「用户已创建但响应 500」的困惑状态，
 * 用户重新注册即可触发重发。
 */
const sendVerificationOtp = async (user: UserRow, ctx: RequestContext): Promise<void> => {
  try {
    await otpService.issue({
      email: user.primary_email,
      purpose: 'verify_email',
      userId: user.id,
      ip: ctx.ip,
    });
  } catch {
    // 冷却期被拒（429）或邮件服务异常，都静默处理
  }
};

export const userService = {
  /**
   * 注册。
   *
   * 响应始终是 202，不区分「邮箱已注册 / 未注册」，避免账号枚举：
   *   - 新邮箱：建号 + 发验证码
   *   - 已注册但未验证：重发验证码给邮箱所有者（不覆盖已设置的密码）
   *   - 已注册且已验证：发一封「该邮箱已注册」的提示邮件
   */
  async register(input: RegisterInput, ctx: RequestContext): Promise<{ accepted: true }> {
    const email = normalizeEmail(input.email);

    await enforceRateLimit(
      `register:ip:${ctx.ip ?? 'unknown'}`,
      10,
      3600,
      '注册请求过于频繁，请稍后再试',
    );
    await enforceRateLimit(`register:email:${email}`, 3, 3600, '该邮箱注册请求过于频繁，请稍后再试');

    const existing = await usersRepository.findByEmail(email);

    if (existing) {
      await auditLog.write({
        event: 'register',
        result: 'duplicate',
        userId: existing.id,
        email,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      if (!existing.email_verified_at) {
        await sendVerificationOtp(existing, ctx);
      } else {
        await mailService
          .sendNotice({
            to: email,
            subject: '该邮箱已注册 Summer Camp',
            text: '有人尝试用这个邮箱注册 Summer Camp，但该邮箱已经注册过了。\n如果你忘记了密码，可以直接使用「邮箱验证码登录」。',
          })
          .catch(() => undefined);
      }

      return { accepted: true };
    }

    const passwordHash = await passwordService.hash(input.password);
    const user = await usersRepository.create({
      email,
      passwordHash,
      displayName: input.displayName ?? null,
    });

    await auditLog.write({
      event: 'register',
      result: 'success',
      userId: user.id,
      email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await sendVerificationOtp(user, ctx);
    return { accepted: true };
  },

  /** 校验注册验证码，把邮箱标记为已验证 */
  async verifyEmail(input: VerifyEmailInput, ctx: RequestContext): Promise<{ verified: true }> {
    const email = normalizeEmail(input.email);

    await enforceRateLimit(`verify-email:ip:${ctx.ip ?? 'unknown'}`, 30, 900, '操作过于频繁，请稍后再试');

    await otpService.verify({ email, purpose: 'verify_email', code: input.code });

    const user = await usersRepository.findByEmail(email);
    if (!user) {
      // 用户可能在发码后被删除
      throw invalidGrant('验证码无效或已过期');
    }

    await usersRepository.markEmailVerified(user.id, new Date());
    await auditLog.write({
      event: 'verify_email',
      result: 'success',
      userId: user.id,
      email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { verified: true };
  },

  /**
   * 发送一次性验证码。
   *   - purpose=logon：无论邮箱是否已注册都发送（首次登录会自动开户）
   *   - purpose=verify_email：只有「已注册但未验证」的邮箱才发送
   * 两种情况对外响应都是 202，不泄露邮箱是否存在于系统中。
   */
  async requestOtp(
    input: OtpRequestInput,
    ctx: RequestContext,
  ): Promise<{ accepted: true; expiresInSeconds: number }> {
    const email = normalizeEmail(input.email);

    await enforceRateLimit(`otp:ip:${ctx.ip ?? 'unknown'}`, 30, 3600, '请求过于频繁，请稍后再试');
    await enforceRateLimit(`otp:email:${email}`, 10, 3600, '该邮箱请求过于频繁，请稍后再试');

    const user = await usersRepository.findByEmail(email);

    if (input.purpose === 'verify_email') {
      if (user && !user.email_verified_at) {
        await sendVerificationOtp(user, ctx);
      }
      return { accepted: true, expiresInSeconds: otpService.expiresInSeconds };
    }

    await otpService.issue({
      email,
      purpose: 'logon',
      userId: user?.id ?? null,
      ip: ctx.ip,
    });

    await auditLog.write({
      event: 'otp_request',
      result: 'success',
      userId: user?.id ?? null,
      email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: { purpose: input.purpose, isNewUser: !user },
    });

    return { accepted: true, expiresInSeconds: otpService.expiresInSeconds };
  },

  async logon(input: LogonInput, ctx: RequestContext): Promise<LogonResult> {
    return input.grant_type === 'password'
      ? logonWithPassword(input, ctx)
      : logonWithOtp(input, ctx);
  },

  /** 刷新令牌（旋转 + 复用检测在 sessionService 内完成） */
  async refresh(presentedToken: string | undefined, ctx: RequestContext): Promise<LogonResult> {
    if (!presentedToken) {
      throw invalidGrant('缺少会话凭证，请重新登录');
    }

    await enforceRateLimit(`refresh:ip:${ctx.ip ?? 'unknown'}`, 120, 900, '请求过于频繁，请稍后再试');

    const rotated = await sessionService.rotate(presentedToken, ctx);
    const user = await usersRepository.findById(rotated.userId);
    if (!user || user.status !== 'active') {
      throw unauthorized('账号状态异常，请重新登录');
    }

    const access = tokenService.signAccessToken({
      userId: user.id,
      sessionId: rotated.sessionId,
      amr: rotated.amr,
    });

    return {
      accessToken: access.token,
      refreshToken: rotated.refreshToken,
      accessExpiresInSeconds: access.expiresInSeconds,
      refreshExpiresInSeconds: rotated.refreshExpiresInSeconds,
      user: toUserProfile(user),
    };
  },

  /** 登出：吊销 refresh token family + 把当前 access token 的 jti 拉黑 */
  async logout(auth: AuthContext, ctx: RequestContext): Promise<void> {
    await sessionService.revokeSession(auth.sessionId, 'logout');
    await jwtDenylistRepository.revoke({
      jti: auth.jti,
      userId: auth.userId,
      reason: 'logout',
      expiresAt: new Date(auth.expiresAt * 1000),
    });

    await auditLog.write({
      event: 'logout',
      result: 'success',
      userId: auth.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  async me(userId: string): Promise<{ user: UserProfile; identities: LinkedIdentity[] }> {
    const user = await usersRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw unauthorized('账号状态异常，请重新登录');
    }

    const identities = await identitiesRepository.listByUser(userId);

    return {
      user: toUserProfile(user),
      identities: identities.map((identity) => ({
        provider: identity.provider,
        email: identity.email_at_provider,
        createdAt: identity.created_at.toISOString(),
      })),
    };
  },

  /**
   * 修改/首次设置密码。
   *   - 已有密码：必须校验当前密码
   *   - 无密码（纯 OTP 注册的账号）：要求本次会话是 OTP 登录，防止会话被劫持后直接设置密码
   * 改密成功后踢掉除当前会话外的所有会话。
   */
  async changePassword(
    auth: AuthContext,
    input: ChangePasswordInput,
    ctx: RequestContext,
  ): Promise<{ revokedSessions: number }> {
    const user = await usersRepository.findById(auth.userId);
    if (!user || user.status !== 'active') {
      throw unauthorized('账号状态异常，请重新登录');
    }

    const existingHash = await passwordRepository.getHash(user.id);

    if (existingHash) {
      if (!input.currentPassword) {
        throw badRequest('请提供当前密码');
      }
      const matched = await passwordService.verify(existingHash, input.currentPassword);
      if (!matched) {
        await auditLog.write({
          event: 'password_change',
          result: 'failure',
          userId: user.id,
          email: user.primary_email,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          meta: { reason: 'current_password_mismatch' },
        });
        throw invalidGrant('当前密码不正确');
      }
    } else if (!auth.amr.includes('otp')) {
      throw forbidden('请先使用邮箱验证码登录后再设置密码');
    }

    await passwordRepository.upsert(user.id, await passwordService.hash(input.newPassword));
    const revokedSessions = await sessionService.revokeOtherSessions(
      user.id,
      auth.sessionId,
      'password_changed',
    );

    await auditLog.write({
      event: 'password_change',
      result: 'success',
      userId: user.id,
      email: user.primary_email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: { revokedSessions },
    });

    return { revokedSessions };
  },
};

async function logonWithPassword(
  input: Extract<LogonInput, { grant_type: 'password' }>,
  ctx: RequestContext,
): Promise<LogonResult> {
  const email = normalizeEmail(input.email);

  await enforceRateLimit(`logon:email:${email}`, 10, 900, '登录尝试过于频繁，请稍后再试');
  await enforceRateLimit(`logon:ip:${ctx.ip ?? 'unknown'}`, 50, 900, '登录尝试过于频繁，请稍后再试');

  const user = await usersRepository.findByEmail(email);
  const passwordHash = user ? await passwordRepository.getHash(user.id) : null;

  if (!user || !passwordHash) {
    // 账号不存在 / 未设置密码，也跑一次哈希比较，抹平时序差异
    await passwordService.dummyVerify();
    await auditLog.write({
      event: 'logon',
      result: 'failure',
      email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: { grant: 'password', reason: 'unknown_account' },
    });
    throw invalidGrant('邮箱或密码不正确');
  }

  const matched = await passwordService.verify(passwordHash, input.password);
  if (!matched) {
    await auditLog.write({
      event: 'logon',
      result: 'failure',
      userId: user.id,
      email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: { grant: 'password', reason: 'bad_password' },
    });
    throw invalidGrant('邮箱或密码不正确');
  }

  if (user.status !== 'active') {
    throw forbidden('账号已被禁用，请联系管理员');
  }

  if (!user.email_verified_at) {
    throw new AppError(403, 'email_unverified', '邮箱尚未验证，请先完成邮箱验证');
  }

  // 登录成功，清掉该邮箱的失败计数
  await rateLimitStore.clear(`logon:email:${email}`);

  await auditLog.write({
    event: 'logon',
    result: 'success',
    userId: user.id,
    email,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    meta: { grant: 'password' },
  });

  return issueSession(user, ['password'], ctx);
}

async function logonWithOtp(
  input: Extract<LogonInput, { grant_type: 'otp' }>,
  ctx: RequestContext,
): Promise<LogonResult> {
  const email = normalizeEmail(input.email);

  await enforceRateLimit(`logon:email:${email}`, 10, 900, '登录尝试过于频繁，请稍后再试');
  await enforceRateLimit(`logon:ip:${ctx.ip ?? 'unknown'}`, 50, 900, '登录尝试过于频繁，请稍后再试');

  const challenge = await otpService.verify({ email, purpose: 'logon', code: input.otp });

  let user = challenge.user_id ? await usersRepository.findById(challenge.user_id) : null;
  if (!user) {
    user = await usersRepository.findByEmail(email);
  }

  if (!user) {
    // 首次邮箱登录：自动开户（无密码账号，后续可在设置里补密码）
    try {
      user = await usersRepository.create({ email, emailVerifiedAt: new Date() });
      await auditLog.write({
        event: 'register',
        result: 'success',
        userId: user.id,
        email,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        meta: { via: 'otp_signup' },
      });
    } catch (error) {
      if (error instanceof AppError && error.status === 409) {
        // 并发下另一个请求刚创建好
        user = await usersRepository.findByEmail(email);
      } else {
        throw error;
      }
    }
  }

  if (!user) {
    throw invalidGrant('验证码无效或已过期');
  }

  if (user.status !== 'active') {
    throw forbidden('账号已被禁用，请联系管理员');
  }

  if (!user.email_verified_at) {
    // 能收到验证码本身就证明了邮箱归属
    await usersRepository.markEmailVerified(user.id, new Date());
  }

  await rateLimitStore.clear(`logon:email:${email}`);

  await auditLog.write({
    event: 'logon',
    result: 'success',
    userId: user.id,
    email,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    meta: { grant: 'otp' },
  });

  return issueSession(user, ['otp'], ctx);
}
