import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@src/config';
import { githubProvider } from '@src/user/oauth/providers/github';

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const params = {
  state: 'state-123',
  codeChallenge: 'challenge-123',
  redirectUri: 'http://localhost:3000/user/oauth/github/callback',
  nonce: 'nonce-123',
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('githubProvider 基础信息', () => {
  it('测试环境配置了假凭证 -> isConfigured 为 true', () => {
    expect(githubProvider.isConfigured()).toBe(true);
    expect(env.github.clientId).toBe('test-github-client-id');
  });

  it('buildAuthorizeUrl 带上 client_id / state / PKCE / scope', () => {
    const url = new URL(githubProvider.buildAuthorizeUrl(params));

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(env.github.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(params.redirectUri);
    expect(url.searchParams.get('state')).toBe(params.state);
    expect(url.searchParams.get('code_challenge')).toBe(params.codeChallenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('allow_signup')).toBe('true');
  });
});

describe('githubProvider.handleCallback', () => {
  const tokenAndUser = (over: {
    token?: unknown;
    user?: unknown;
    emails?: unknown;
    emailsFail?: boolean;
    tokenStatus?: number;
  } = {}) => {
    fetchMock.mockImplementation(async (url: unknown) => {
      if (String(url).includes('/login/oauth/access_token')) {
        return jsonResponse(over.token ?? { access_token: 'gh-token' }, over.tokenStatus ?? 200);
      }
      if (String(url).includes('/user/emails')) {
        if (over.emailsFail) return jsonResponse({ message: 'nope' }, 500);
        return jsonResponse(over.emails ?? [{ email: 'verified@example.com', primary: true, verified: true }]);
      }
      return jsonResponse(
        over.user ?? { id: 42, login: 'octocat', name: 'The Octocat', avatar_url: 'https://a/b.png', email: null },
      );
    });
  };

  it('用 code 换 token，再拉 profile + emails，并选已验证的主邮箱', async () => {
    tokenAndUser({
      emails: [
        { email: 'unverified@example.com', primary: false, verified: false },
        { email: 'secondary@example.com', primary: false, verified: true },
        { email: 'primary@example.com', primary: true, verified: true },
      ],
    });

    const profile = await githubProvider.handleCallback({ ...params, code: 'the-code', codeVerifier: 'verifier' });

    expect(profile).toEqual({
      provider: 'github',
      providerUserId: '42',
      email: 'primary@example.com',
      emailVerified: true,
      displayName: 'The Octocat',
      avatarUrl: 'https://a/b.png',
      raw: { login: 'octocat', id: 42 },
    });

    // token 请求带上了 client_secret / code / redirect_uri / code_verifier
    const tokenCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('access_token'))!;
    expect(JSON.parse(String(tokenCall[1].body))).toEqual({
      client_id: env.github.clientId,
      client_secret: env.github.clientSecret,
      code: 'the-code',
      redirect_uri: params.redirectUri,
      code_verifier: 'verifier',
    });
  });

  it('没有主邮箱时退而选择任意已验证邮箱', async () => {
    tokenAndUser({
      emails: [
        { email: 'unverified@example.com', primary: false, verified: false },
        { email: 'secondary@example.com', primary: false, verified: true },
      ],
    });

    const profile = await githubProvider.handleCallback({ ...params, code: 'c', codeVerifier: 'v' });
    expect(profile.email).toBe('secondary@example.com');
    expect(profile.emailVerified).toBe(true);
  });

  it('没有已验证邮箱 -> email 为 null 且 emailVerified=false', async () => {
    tokenAndUser({ emails: [{ email: 'unverified@example.com', primary: true, verified: false }] });

    const profile = await githubProvider.handleCallback({ ...params, code: 'c', codeVerifier: 'v' });
    expect(profile.email).toBeNull();
    expect(profile.emailVerified).toBe(false);
  });

  it('emails 接口失败不影响登录（公开 profile 仍可用，只是没有邮箱）', async () => {
    tokenAndUser({ emailsFail: true });

    const profile = await githubProvider.handleCallback({ ...params, code: 'c', codeVerifier: 'v' });
    expect(profile.email).toBeNull();
    expect(profile.displayName).toBe('The Octocat');
  });

  it('displayName 缺失时回退成 login', async () => {
    tokenAndUser({ user: { id: 7, login: 'octocat', name: null, avatar_url: null, email: null } });

    const profile = await githubProvider.handleCallback({ ...params, code: 'c', codeVerifier: 'v' });
    expect(profile.displayName).toBe('octocat');
  });

  it('token 交换被拒绝 -> 400 badRequest，并带 reason（不泄露 secret）', async () => {
    tokenAndUser({ token: { error: 'bad_verification_code', error_description: 'The code passed is incorrect' } });

    const error = await githubProvider
      .handleCallback({ ...params, code: 'bad', codeVerifier: 'v' })
      .catch((caught: { status: number; details: Record<string, unknown> }) => caught);

    expect(error).toMatchObject({ status: 400 });
    expect((error as unknown as { details: Record<string, unknown> }).details).toEqual({
      reason: 'bad_verification_code',
      description: 'The code passed is incorrect',
    });
    expect(JSON.stringify(error)).not.toContain(env.github.clientSecret);
  });

  it('GitHub 返回非 2xx -> 503 serviceUnavailable', async () => {
    tokenAndUser({ tokenStatus: 500 });

    await expect(
      githubProvider.handleCallback({ ...params, code: 'c', codeVerifier: 'v' }),
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining('HTTP 500') });
  });

  it('请求超时保护：fetch 收到 AbortSignal', async () => {
    tokenAndUser();
    await githubProvider.handleCallback({ ...params, code: 'c', codeVerifier: 'v' });

    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.signal).toBeDefined();
    }
  });
});
