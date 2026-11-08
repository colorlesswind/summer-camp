import { AppError, badRequest, notFound, serviceUnavailable } from '../../common/errors';
import { randomToken, sha256Base64Url } from '../../common/crypto';
import type { RequestContext } from '../../common/http';
import { auditLog } from '../../infra/audit.log';
import { usersRepository } from '../user.repository';
import { identitiesRepository } from '../identity.repository';
import { oauthStateRepository } from '../auth/oauth-state.repository';
import { issueSession, type LogonResult } from '../user.service';
import { getProvider } from './identity-provider';
import type { AuthMethod, UserRow } from '../user.types';
// 触发 providers 注册
import './providers';

const STATE_TTL_MS = 10 * 60 * 1000;

/** 只允许站内相对路径，避免开放重定向 */
export const safeRedirectPath = (value: unknown): string => {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value.slice(0, 512);
};

const amrFor = (providerName: string): AuthMethod => (providerName === 'github' ? 'github' : 'oidc');

export interface CallbackOutcome {
  kind: 'session' | 'link_required';
  provider: string;
  redirectTo: string;
  session?: LogonResult;
  email?: string | null;
}

export const oauthService = {
  async buildAuthorizeUrl(input: {
    providerName: string;
    linkUserId: string | null;
    redirectTo: string;
  }): Promise<string> {
    const provider = getProvider(input.providerName);
    if (!provider) throw notFound('不支持的第三方登录方式');
    if (!provider.isConfigured()) throw serviceUnavailable('该第三方登录方式尚未配置');

    const state = randomToken(32);
    const codeVerifier = randomToken(48);
    const nonce = randomToken(32);

    await oauthStateRepository.create({
      state,
      provider: provider.name,
      codeVerifier,
      nonce,
      redirectTo: safeRedirectPath(input.redirectTo),
      linkUserId: input.linkUserId,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });

    return provider.buildAuthorizeUrl({
      state,
      codeChallenge: sha256Base64Url(codeVerifier),
      redirectUri: provider.redirectUri,
      nonce,
    });
  },

  /**
   * 第三方回调。
   *
   * 账号映射规则（按优先级）：
   *   1. 该 provider_user_id 已绑定过  -> 直接登录
   *   2. 本次授权带 link_user_id（用户已登录后主动绑定）-> 建立绑定
   *   3. 否则新建用户；**如果邮箱已存在，绝不自动合并**，返回 link_required
   *      让用户先登录原账号再手动绑定，杜绝账号接管。
   */
  async handleCallback(input: {
    providerName: string;
    code: string;
    state: string;
    ctx: RequestContext;
  }): Promise<CallbackOutcome> {
    const provider = getProvider(input.providerName);
    if (!provider) throw notFound('不支持的第三方登录方式');
    if (!provider.isConfigured()) throw serviceUnavailable('该第三方登录方式尚未配置');

    const stateRow = await oauthStateRepository.consume(input.state);
    if (!stateRow || stateRow.provider !== provider.name) {
      throw badRequest('授权状态已失效，请重新发起登录');
    }
    if (stateRow.expires_at.getTime() <= Date.now()) {
      throw badRequest('授权已超时，请重新发起登录');
    }

    const profile = await provider.handleCallback({
      code: input.code,
      codeVerifier: stateRow.code_verifier,
      redirectUri: provider.redirectUri,
      nonce: stateRow.nonce ?? '',
    });

    const redirectTo = safeRedirectPath(stateRow.redirect_to);

    const existingIdentity = await identitiesRepository.findByProvider(
      provider.name,
      profile.providerUserId,
    );

    if (existingIdentity) {
      const boundUser = await usersRepository.findById(existingIdentity.user_id);
      if (!boundUser || boundUser.status !== 'active') {
        throw badRequest('绑定的账号状态异常，请联系管理员');
      }
      return {
        kind: 'session',
        provider: provider.name,
        redirectTo,
        session: await finishLogin(boundUser, provider.name, input.ctx),
      };
    }

    if (stateRow.link_user_id) {
      const targetUser = await usersRepository.findById(stateRow.link_user_id);
      if (!targetUser) throw badRequest('待绑定的账号不存在');

      await identitiesRepository.create({
        userId: targetUser.id,
        provider: provider.name,
        providerUserId: profile.providerUserId,
        email: profile.email,
        profile: profile.raw,
      });

      await auditLog.write({
        event: 'identity_link',
        result: 'success',
        userId: targetUser.id,
        email: targetUser.primary_email,
        ip: input.ctx.ip,
        userAgent: input.ctx.userAgent,
        meta: { provider: provider.name },
      });

      return { kind: 'session', provider: provider.name, redirectTo, session: await finishLogin(targetUser, provider.name, input.ctx) };
    }

    if (!profile.email) {
      throw badRequest('该第三方账号没有提供可用邮箱，请先在第三方平台绑定邮箱');
    }

    const sameEmailUser = await usersRepository.findByEmail(profile.email);
    if (sameEmailUser) {
      await auditLog.write({
        event: 'oauth_callback',
        result: 'failure',
        userId: sameEmailUser.id,
        email: profile.email,
        ip: input.ctx.ip,
        userAgent: input.ctx.userAgent,
        meta: { provider: provider.name, reason: 'link_required' },
      });
      return {
        kind: 'link_required',
        provider: provider.name,
        redirectTo,
        email: profile.email,
      };
    }

    let user: UserRow;
    try {
      user = await usersRepository.create({
        email: profile.email,
        displayName: profile.displayName,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
      });
    } catch (error) {
      // 并发下另一方刚创建了同邮箱账号
      if (error instanceof AppError && error.status === 409) {
        return {
          kind: 'link_required',
          provider: provider.name,
          redirectTo,
          email: profile.email,
        };
      }
      throw error;
    }

    await identitiesRepository.create({
      userId: user.id,
      provider: provider.name,
      providerUserId: profile.providerUserId,
      email: profile.email,
      profile: profile.raw,
    });

    await auditLog.write({
      event: 'oauth_callback',
      result: 'success',
      userId: user.id,
      email: profile.email,
      ip: input.ctx.ip,
      userAgent: input.ctx.userAgent,
      meta: { provider: provider.name, newUser: true },
    });

    return {
      kind: 'session',
      provider: provider.name,
      redirectTo,
      session: await finishLogin(user, provider.name, input.ctx),
    };
  },
};

const finishLogin = async (
  user: UserRow,
  providerName: string,
  ctx: RequestContext,
): Promise<LogonResult> => {
  await auditLog.write({
    event: 'logon',
    result: 'success',
    userId: user.id,
    email: user.primary_email,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    meta: { grant: 'oauth', provider: providerName },
  });

  return issueSession(user, [amrFor(providerName)], ctx);
};
