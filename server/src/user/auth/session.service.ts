import { env } from '../../config';
import { invalidGrant } from '../../common/errors';
import { newId, randomToken, sha256Hex, truncate } from '../../common/crypto';
import { refreshTokenRepository } from './refresh-token.repository';
import { usersRepository } from '../user.repository';
import type { AuthMethod, UserRow } from '../user.types';

export interface SessionContext {
  ip: string | null;
  userAgent: string | null;
}

export interface StartedSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  refreshExpiresInSeconds: number;
}

export interface RotatedSession extends StartedSession {
  userId: string;
  amr: AuthMethod[];
  accessJti: string;
}

const toAmr = (value: string): AuthMethod[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is AuthMethod => item.length > 0);

const issueRefreshToken = async (input: {
  userId: string;
  familyId: string;
  parentJti: string | null;
  amr: AuthMethod[];
  ctx: SessionContext;
}): Promise<{ jti: string; plain: string; expiresAt: Date }> => {
  const jti = newId();
  const plain = randomToken(48);
  const expiresAt = new Date(Date.now() + env.cookie.refreshTtlSeconds * 1000);

  await refreshTokenRepository.create({
    jti,
    userId: input.userId,
    familyId: input.familyId,
    parentJti: input.parentJti,
    tokenHash: sha256Hex(plain),
    amr: input.amr.join(',') || 'password',
    userAgent: truncate(input.ctx.userAgent, 255),
    ip: truncate(input.ctx.ip, 64),
    expiresAt,
  });

  return { jti, plain, expiresAt };
};

/**
 * 会话 = 一条 refresh token family。
 * 每次刷新都会旋转 token；旧 token 被再次使用即判定为泄露，整个 family 立即吊销。
 */
export const sessionService = {
  async start(user: UserRow, amr: AuthMethod[], ctx: SessionContext): Promise<StartedSession> {
    const sessionId = newId();
    const issued = await issueRefreshToken({
      userId: user.id,
      familyId: sessionId,
      parentJti: null,
      amr,
      ctx,
    });

    return {
      sessionId,
      refreshToken: issued.plain,
      refreshExpiresAt: issued.expiresAt,
      refreshExpiresInSeconds: env.cookie.refreshTtlSeconds,
    };
  },

  async rotate(presentedToken: string, ctx: SessionContext): Promise<RotatedSession> {
    const tokenHash = sha256Hex(presentedToken);
    const row = await refreshTokenRepository.findByHash(tokenHash);

    if (!row) {
      throw invalidGrant('会话不存在或已失效，请重新登录');
    }

    // 复用检测：已吊销的 token 又被使用 => 大概率被窃取，直接干掉整个 family
    if (row.revoked_at) {
      await refreshTokenRepository.revokeFamily(row.family_id, 'token_reuse', new Date());
      throw invalidGrant('检测到异常会话，已为你登出，请重新登录');
    }

    if (row.expires_at.getTime() <= Date.now()) {
      await refreshTokenRepository.revoke(row.jti, 'expired', new Date());
      throw invalidGrant('会话已过期，请重新登录');
    }

    const user = await usersRepository.findById(row.user_id);
    if (!user || user.status !== 'active') {
      await refreshTokenRepository.revokeFamily(row.family_id, 'user_inactive', new Date());
      throw invalidGrant('账号状态异常，请联系管理员');
    }

    // 原子旋转：同一个 refresh token 只有一个并发请求能成功
    const rotated = await refreshTokenRepository.markRotated(row.jti, new Date());
    if (!rotated) {
      await refreshTokenRepository.revokeFamily(row.family_id, 'concurrent_rotation', new Date());
      throw invalidGrant('会话已被更新，请重新登录');
    }

    const amr = toAmr(row.amr);
    const issued = await issueRefreshToken({
      userId: row.user_id,
      familyId: row.family_id,
      parentJti: row.jti,
      amr,
      ctx,
    });

    return {
      sessionId: row.family_id,
      userId: row.user_id,
      amr,
      accessJti: issued.jti,
      refreshToken: issued.plain,
      refreshExpiresAt: issued.expiresAt,
      refreshExpiresInSeconds: env.cookie.refreshTtlSeconds,
    };
  },

  /** 登出：吊销整条 family（当前+其历史 token） */
  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await refreshTokenRepository.revokeFamily(sessionId, reason, new Date());
  },

  /** 改密码等敏感操作：把除当前会话外的所有会话踢掉 */
  async revokeOtherSessions(userId: string, keepSessionId: string, reason: string): Promise<number> {
    return refreshTokenRepository.revokeAllForUser(userId, reason, new Date(), keepSessionId);
  },
};
