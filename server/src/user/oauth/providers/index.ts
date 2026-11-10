import { registerProvider } from '../identity-provider';
import { githubProvider } from './github';
import { oidcProvider } from './oidc';

/**
 * 新增第三方登录步骤：
 *   1. providers/ 下实现 IdentityProvider
 *   2. 在下面注册
 *   3. .env 里补上 clientId/secret/redirectUri
 * 业务逻辑（用户创建、绑定、发 token）完全不需要改。
 */
registerProvider(githubProvider);
registerProvider(oidcProvider);

export { githubProvider, oidcProvider };
