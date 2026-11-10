import { env } from '../../../config';
import { serviceUnavailable, badRequest } from '../../../common/errors';
import type { ExternalProfile, IdentityProvider } from '../identity-provider';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API_BASE = 'https://api.github.com';

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

const githubFetch = async <T>(url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'summer-camp-server',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw serviceUnavailable(`GitHub 接口调用失败（HTTP ${response.status}）`);
  }

  return (await response.json()) as T;
};

/**
 * GitHub 是 OAuth2 而不是 OIDC：没有 id_token，
 * 只能用 code 换 access_token，再调 /user + /user/emails 拿身份。
 */
export const githubProvider: IdentityProvider = {
  name: 'github',
  label: 'GitHub',
  redirectUri: env.github.redirectUri,

  isConfigured(): boolean {
    return Boolean(env.github.clientId && env.github.clientSecret);
  },

  buildAuthorizeUrl({ state, codeChallenge, redirectUri }): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', env.github.clientId ?? '');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('allow_signup', 'true');
    return url.toString();
  },

  async handleCallback({ code, codeVerifier, redirectUri }): Promise<ExternalProfile> {
    if (!this.isConfigured()) {
      throw serviceUnavailable('GitHub 登录尚未配置');
    }

    const token = await githubFetch<GitHubTokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.github.clientId,
        client_secret: env.github.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!token.access_token) {
      throw badRequest('GitHub 授权失败，请重试', {
        reason: token.error ?? 'unknown',
        description: token.error_description,
      });
    }

    const headers = { Authorization: `Bearer ${token.access_token}` };

    const [profile, emails] = await Promise.all([
      githubFetch<GitHubUser>(`${API_BASE}/user`, { method: 'GET', headers }),
      githubFetch<GitHubEmail[]>(`${API_BASE}/user/emails`, { method: 'GET', headers }).catch(
        () => [] as GitHubEmail[],
      ),
    ]);

    const verifiedPrimary =
      emails.find((item) => item.primary && item.verified) ?? emails.find((item) => item.verified);
    const email = verifiedPrimary?.email ?? null;

    return {
      provider: 'github',
      providerUserId: String(profile.id),
      email,
      emailVerified: Boolean(verifiedPrimary?.verified),
      displayName: profile.name ?? profile.login,
      avatarUrl: profile.avatar_url,
      raw: { login: profile.login, id: profile.id },
    };
  },
};
