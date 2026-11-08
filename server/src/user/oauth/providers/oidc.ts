import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../../../config';
import { badRequest, serviceUnavailable } from '../../../common/errors';
import { logger } from '../../../common/logger';
import type { ExternalProfile, IdentityProvider } from '../identity-provider';

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
let discoveryCache: { doc: DiscoveryDocument; expiresAt: number } | null = null;

const issuer = (): string => (env.oidc.issuer ?? '').replace(/\/+$/, '');

const discovery = async (): Promise<DiscoveryDocument> => {
  if (discoveryCache && discoveryCache.expiresAt > Date.now()) {
    return discoveryCache.doc;
  }

  const base = issuer();
  if (!base) throw serviceUnavailable('OIDC 登录尚未配置');

  const response = await fetch(`${base}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw serviceUnavailable(`OIDC 发现文档获取失败（HTTP ${response.status}）`);
  }

  const doc = (await response.json()) as DiscoveryDocument;
  discoveryCache = { doc, expiresAt: Date.now() + DISCOVERY_TTL_MS };
  return doc;
};

/**
 * 标准 OIDC（Authorization Code + PKCE + nonce）。
 * id_token 的签名 / iss / aud / exp / nonce 全部由 jose 校验，
 * 不要自己解析 JWT 后手工判断，容易漏掉 alg 混淆等攻击面。
 */
export const oidcProvider: IdentityProvider = {
  name: 'oidc',
  label: 'OpenID Connect',
  redirectUri: env.oidc.redirectUri,

  isConfigured(): boolean {
    return Boolean(env.oidc.issuer && env.oidc.clientId);
  },

  async buildAuthorizeUrl({ state, codeChallenge, redirectUri, nonce }): Promise<string> {
    const doc = await discovery();

    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env.oidc.clientId ?? '');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', env.oidc.scopes);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  },

  async handleCallback({ code, codeVerifier, redirectUri, nonce }): Promise<ExternalProfile> {
    const doc = await discovery();

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: env.oidc.clientId ?? '',
      code_verifier: codeVerifier,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    if (env.oidc.clientSecret) {
      const basic = Buffer.from(`${env.oidc.clientId}:${env.oidc.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basic}`;
    }

    const response = await fetch(doc.token_endpoint, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const token = (await response.json()) as TokenResponse;
    if (!response.ok || !token.id_token) {
      logger.warn({ err: token }, 'oidc token exchange failed');
      throw badRequest('OIDC 授权失败，请重试', {
        reason: token.error ?? 'invalid_response',
        description: token.error_description,
      });
    }

    const jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
    const { payload } = await jwtVerify(token.id_token, jwks, {
      issuer: doc.issuer,
      audience: env.oidc.clientId ?? '',
      clockTolerance: 60,
    });

    if (payload.nonce !== nonce) {
      throw badRequest('OIDC 授权校验失败（nonce 不匹配）');
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    if (!sub) {
      throw badRequest('OIDC 返回的 id_token 缺少 sub');
    }

    const rawEmail = typeof payload['email'] === 'string' ? payload['email'] : null;
    const rawVerified: unknown = payload['email_verified'];
    const emailVerified = rawVerified === true || rawVerified === 'true';

    return {
      provider: 'oidc',
      providerUserId: sub,
      email: rawEmail,
      emailVerified,
      displayName: typeof payload['name'] === 'string' ? payload['name'] : null,
      avatarUrl: typeof payload['picture'] === 'string' ? payload['picture'] : null,
      raw: { iss: payload.iss, sub },
    };
  },
};
