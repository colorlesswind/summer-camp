export interface ExternalProfile {
  provider: string;
  /** provider 侧唯一的用户标识（GitHub id / OIDC sub / WeChat openid） */
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  raw: unknown;
}

export interface AuthorizeUrlParams {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  nonce: string;
}

export interface CallbackParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce: string;
}

/**
 * 第三方登录提供方的统一抽象。
 *
 * 注意：只有标准 OIDC 才是 OIDC；GitHub / 微信都是 OAuth2 的私有变体。
 * 把它们收敛到同一个接口后面，业务层（user.service）完全感知不到差异，
 * 未来接入微信只需新增一个实现并注册。
 */
export interface IdentityProvider {
  readonly name: string;
  readonly label: string;
  /** 回调地址，必须与第三方后台登记的完全一致 */
  readonly redirectUri: string;
  isConfigured(): boolean;
  /** OIDC 需要先取 discovery 文档，因此允许返回 Promise */
  buildAuthorizeUrl(params: AuthorizeUrlParams): string | Promise<string>;
  handleCallback(params: CallbackParams): Promise<ExternalProfile>;
}

const registry = new Map<string, IdentityProvider>();

export const registerProvider = (provider: IdentityProvider): void => {
  registry.set(provider.name, provider);
};

export const getProvider = (name: string): IdentityProvider | null => registry.get(name) ?? null;

export const listProviders = (): Array<{ name: string; label: string; configured: boolean }> =>
  Array.from(registry.values()).map((provider) => ({
    name: provider.name,
    label: provider.label,
    configured: provider.isConfigured(),
  }));
