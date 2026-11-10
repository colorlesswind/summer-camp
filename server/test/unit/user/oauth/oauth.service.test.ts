import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Base64Url } from '@src/common/crypto';
import type { IdentityProvider, ExternalProfile } from '@src/user/oauth/identity-provider';
import type { OAuthStateRow, UserRow } from '@src/user/user.types';

vi.mock('@src/user/oauth/identity-provider', () => ({
  getProvider: vi.fn(),
  registerProvider: vi.fn(),
  listProviders: vi.fn(() => []),
}));
vi.mock('@src/user/auth/oauth-state.repository', () => ({
  oauthStateRepository: { create: vi.fn(), consume: vi.fn(), purgeExpired: vi.fn() },
}));
vi.mock('@src/user/user.repository', () => ({
  usersRepository: { findByEmail: vi.fn(), findById: vi.fn(), create: vi.fn() },
}));
vi.mock('@src/user/identity.repository', () => ({
  identitiesRepository: { findByProvider: vi.fn(), create: vi.fn() },
}));
vi.mock('@src/user/user.service', () => ({
  issueSession: vi.fn(),
}));
vi.mock('@src/infra/audit.log', () => ({
  auditLog: { write: vi.fn() },
}));

import { oauthService, safeRedirectPath } from '@src/user/oauth/oauth.service';
import { getProvider } from '@src/user/oauth/identity-provider';
import { oauthStateRepository } from '@src/user/auth/oauth-state.repository';
import { usersRepository } from '@src/user/user.repository';
import { identitiesRepository } from '@src/user/identity.repository';
import { issueSession } from '@src/user/user.service';
import { auditLog } from '@src/infra/audit.log';
import { conflict } from '@src/common/errors';

const getProviderMock = vi.mocked(getProvider);
const createState = vi.mocked(oauthStateRepository.create);
const consumeState = vi.mocked(oauthStateRepository.consume);
const findByEmail = vi.mocked(usersRepository.findByEmail);
const findById = vi.mocked(usersRepository.findById);
const createUser = vi.mocked(usersRepository.create);
const findIdentity = vi.mocked(identitiesRepository.findByProvider);
const createIdentity = vi.mocked(identitiesRepository.create);
const issueSessionMock = vi.mocked(issueSession);
const auditWrite = vi.mocked(auditLog.write);

const ctx = { ip: '203.0.113.5', userAgent: 'vitest' };

const userRow = (over: Record<string, unknown> = {}): UserRow =>
  ({
    id: 'user-1',
    primary_email: 'student@example.com',
    display_name: 'Alice',
    email_verified_at: new Date(),
    status: 'active',
    role: 'student',
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  }) as unknown as UserRow;

const profile = (over: Partial<ExternalProfile> = {}): ExternalProfile => ({
  provider: 'github',
  providerUserId: 'gh-42',
  email: 'gh@example.com',
  emailVerified: true,
  displayName: 'GH User',
  avatarUrl: null,
  raw: { id: 42 },
  ...over,
});

const makeProvider = (over: Partial<IdentityProvider> = {}): IdentityProvider => ({
  name: 'github',
  label: 'GitHub',
  redirectUri: 'http://localhost:3000/user/oauth/github/callback',
  isConfigured: () => true,
  buildAuthorizeUrl: () => 'https://github.com/login/oauth/authorize?state=s',
  handleCallback: async () => profile(),
  ...over,
});

const stateRow = (over: Record<string, unknown> = {}): OAuthStateRow =>
  ({
    state: 'state-1',
    provider: 'github',
    code_verifier: 'verifier-1',
    nonce: 'nonce-1',
    redirect_to: '/student/apply',
    link_user_id: null,
    expires_at: new Date(Date.now() + 60_000),
    created_at: new Date(),
    ...over,
  }) as unknown as OAuthStateRow;

const sessionResult = {
  accessToken: 'at',
  refreshToken: 'rt',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
  user: {
    id: 'user-1',
    email: 'student@example.com',
    displayName: null,
    emailVerified: true,
    status: 'active',
    role: 'student',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  getProviderMock.mockReturnValue(makeProvider());
  createState.mockResolvedValue(undefined);
  findByEmail.mockResolvedValue(null);
  findById.mockResolvedValue(userRow());
  createUser.mockResolvedValue(userRow());
  findIdentity.mockResolvedValue(null);
  createIdentity.mockResolvedValue({} as never);
  issueSessionMock.mockResolvedValue(sessionResult as never);
  auditWrite.mockResolvedValue(undefined);
});

describe('safeRedirectPath', () => {
  it('允许站内相对路径', () => {
    expect(safeRedirectPath('/student/apply')).toBe('/student/apply');
    expect(safeRedirectPath('/a?b=c#d')).toBe('/a?b=c#d');
  });

  it('拒绝绝对 URL / 协议相对 URL（防开放重定向）', () => {
    expect(safeRedirectPath('https://evil.example')).toBe('/');
    expect(safeRedirectPath('//evil.example')).toBe('/');
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/');
  });

  it('非字符串与超长值兜底', () => {
    expect(safeRedirectPath(undefined)).toBe('/');
    expect(safeRedirectPath(42)).toBe('/');
    expect(safeRedirectPath(`/${'a'.repeat(600)}`)).toHaveLength(512);
  });
});

describe('oauthService.buildAuthorizeUrl', () => {
  it('未知 provider -> 404', async () => {
    getProviderMock.mockReturnValue(null);
    await expect(
      oauthService.buildAuthorizeUrl({ providerName: 'wechat', linkUserId: null, redirectTo: '/' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('provider 未配置 -> 503（前端据此隐藏按钮）', async () => {
    getProviderMock.mockReturnValue(makeProvider({ isConfigured: () => false }));
    await expect(
      oauthService.buildAuthorizeUrl({ providerName: 'github', linkUserId: null, redirectTo: '/' }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('生成一次性 state / PKCE verifier / nonce，并把 challenge 传给 provider', async () => {
    const buildAuthorizeUrl = vi.fn(() => 'https://github.com/authorize?x=1');
    getProviderMock.mockReturnValue(makeProvider({ buildAuthorizeUrl }));

    const url = await oauthService.buildAuthorizeUrl({
      providerName: 'github',
      linkUserId: null,
      redirectTo: '/student/apply',
    });

    expect(url).toBe('https://github.com/authorize?x=1');
    const stored = createState.mock.calls[0]![0];
    expect(stored).toMatchObject({
      provider: 'github',
      redirectTo: '/student/apply',
      linkUserId: null,
      nonce: expect.any(String),
      codeVerifier: expect.any(String),
    });
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(buildAuthorizeUrl).toHaveBeenCalledWith({
      state: stored.state,
      codeChallenge: sha256Base64Url(stored.codeVerifier),
      redirectUri: 'http://localhost:3000/user/oauth/github/callback',
      nonce: stored.nonce,
    });
  });

  it('外站 redirectTo 会被清洗成 /（防开放重定向）', async () => {
    await oauthService.buildAuthorizeUrl({
      providerName: 'github',
      linkUserId: null,
      redirectTo: 'https://evil.example/steal',
    });
    expect(createState.mock.calls[0]![0].redirectTo).toBe('/');
  });

  it('已登录用户发起绑定时记录 linkUserId', async () => {
    await oauthService.buildAuthorizeUrl({
      providerName: 'github',
      linkUserId: 'user-1',
      redirectTo: '/settings',
    });
    expect(createState.mock.calls[0]![0].linkUserId).toBe('user-1');
  });
});

describe('oauthService.handleCallback - 前置校验', () => {
  it('未知 provider -> 404', async () => {
    getProviderMock.mockReturnValue(null);
    await expect(
      oauthService.handleCallback({ providerName: 'x', code: 'c', state: 's', ctx }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('state 不存在 -> 400（一次性，防重放）', async () => {
    consumeState.mockResolvedValue(null);
    await expect(
      oauthService.handleCallback({ providerName: 'github', code: 'c', state: 's', ctx }),
    ).rejects.toMatchObject({ status: 400, message: '授权状态已失效，请重新发起登录' });
  });

  it('state 的 provider 不匹配 -> 400（防止串用别的 provider 的 state）', async () => {
    consumeState.mockResolvedValue(stateRow({ provider: 'oidc' }));
    await expect(
      oauthService.handleCallback({ providerName: 'github', code: 'c', state: 's', ctx }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('state 过期 -> 400', async () => {
    consumeState.mockResolvedValue(stateRow({ expires_at: new Date(Date.now() - 1000) }));
    await expect(
      oauthService.handleCallback({ providerName: 'github', code: 'c', state: 's', ctx }),
    ).rejects.toMatchObject({ status: 400, message: '授权已超时，请重新发起登录' });
  });
});

describe('oauthService.handleCallback - 账号映射', () => {
  it('已绑定的第三方身份 -> 直接登录', async () => {
    consumeState.mockResolvedValue(stateRow());
    findIdentity.mockResolvedValue({ id: 'i1', user_id: 'user-1' } as never);

    const outcome = await oauthService.handleCallback({
      providerName: 'github',
      code: 'c',
      state: 's',
      ctx,
    });

    expect(outcome.kind).toBe('session');
    expect(outcome.session).toBe(sessionResult);
    expect(issueSessionMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), ['github'], ctx);
    // 已绑定用户不需要新建身份
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it('绑定到的账号已禁用 -> 400', async () => {
    consumeState.mockResolvedValue(stateRow());
    findIdentity.mockResolvedValue({ id: 'i1', user_id: 'user-1' } as never);
    findById.mockResolvedValue(userRow({ status: 'locked' }));

    await expect(
      oauthService.handleCallback({ providerName: 'github', code: 'c', state: 's', ctx }),
    ).rejects.toMatchObject({ status: 400, message: '绑定的账号状态异常，请联系管理员' });
  });

  it('带着 linkUserId（已登录后主动绑定）-> 建立绑定并登录', async () => {
    consumeState.mockResolvedValue(stateRow({ link_user_id: 'user-1' }));

    const outcome = await oauthService.handleCallback({
      providerName: 'github',
      code: 'c',
      state: 's',
      ctx,
    });

    expect(createIdentity).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'github',
      providerUserId: 'gh-42',
      email: 'gh@example.com',
      profile: { id: 42 },
    });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'identity_link', result: 'success' }),
    );
    expect(outcome.kind).toBe('session');
  });

  it('待绑定的本地账号不存在 -> 400', async () => {
    consumeState.mockResolvedValue(stateRow({ link_user_id: 'ghost' }));
    findById.mockResolvedValue(null);

    await expect(
      oauthService.handleCallback({ providerName: 'github', code: 'c', state: 's', ctx }),
    ).rejects.toMatchObject({ status: 400, message: '待绑定的账号不存在' });
  });

  it('第三方没有邮箱 -> 400（无法开户）', async () => {
    consumeState.mockResolvedValue(stateRow());
    getProviderMock.mockReturnValue(makeProvider({ handleCallback: async () => profile({ email: null }) }));

    await expect(
      oauthService.handleCallback({ providerName: 'github', code: 'c', state: 's', ctx }),
    ).rejects.toMatchObject({
      status: 400,
      message: '该第三方账号没有提供可用邮箱，请先在第三方平台绑定邮箱',
    });
  });

  it('邮箱已存在 -> 返回 link_required，绝不自动合并（防账号接管）', async () => {
    consumeState.mockResolvedValue(stateRow());
    findByEmail.mockResolvedValue(userRow());

    const outcome = await oauthService.handleCallback({
      providerName: 'github',
      code: 'c',
      state: 's',
      ctx,
    });

    expect(outcome).toEqual({
      kind: 'link_required',
      provider: 'github',
      redirectTo: '/student/apply',
      email: 'gh@example.com',
    });
    expect(createIdentity).not.toHaveBeenCalled();
    expect(issueSessionMock).not.toHaveBeenCalled();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'oauth_callback', result: 'failure' }),
    );
  });

  it('全新用户 -> 建号 + 建绑定 + 登录', async () => {
    consumeState.mockResolvedValue(stateRow());

    const outcome = await oauthService.handleCallback({
      providerName: 'github',
      code: 'c',
      state: 's',
      ctx,
    });

    expect(createUser).toHaveBeenCalledWith({
      email: 'gh@example.com',
      displayName: 'GH User',
      emailVerifiedAt: expect.any(Date),
    });
    expect(createIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', provider: 'github', providerUserId: 'gh-42' }),
    );
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'oauth_callback', result: 'success', meta: { provider: 'github', newUser: true } }),
    );
    expect(outcome.kind).toBe('session');
  });

  it('第三方邮箱未验证 -> 开户时 emailVerifiedAt 为 null', async () => {
    consumeState.mockResolvedValue(stateRow());
    getProviderMock.mockReturnValue(
      makeProvider({ handleCallback: async () => profile({ emailVerified: false }) }),
    );

    await oauthService.handleCallback({ providerName: 'github', code: 'c', state: 's', ctx });

    expect(createUser).toHaveBeenCalledWith({
      email: 'gh@example.com',
      displayName: 'GH User',
      emailVerifiedAt: null,
    });
  });

  it('并发下同邮箱已被创建（409）-> 降级为 link_required', async () => {
    consumeState.mockResolvedValue(stateRow());
    createUser.mockRejectedValue(conflict('该邮箱已被注册', { code: 'email_taken' }));

    const outcome = await oauthService.handleCallback({
      providerName: 'github',
      code: 'c',
      state: 's',
      ctx,
    });

    expect(outcome.kind).toBe('link_required');
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it('非 409 的建号错误向上抛（不能把数据库故障伪装成需要绑定）', async () => {
    consumeState.mockResolvedValue(stateRow());
    createUser.mockRejectedValue(new Error('db down'));

    await expect(
      oauthService.handleCallback({ providerName: 'github', code: 'c', state: 's', ctx }),
    ).rejects.toThrow('db down');
  });

  it('回调里的 redirectTo 同样做开放重定向清洗', async () => {
    consumeState.mockResolvedValue(stateRow({ redirect_to: '//evil.example' }));

    const outcome = await oauthService.handleCallback({
      providerName: 'github',
      code: 'c',
      state: 's',
      ctx,
    });

    expect(outcome.redirectTo).toBe('/');
  });
});
