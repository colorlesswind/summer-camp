import { Router } from 'express';
import { env } from '../../config';
import { unauthorized } from '../../common/errors';
import { randomToken } from '../../common/crypto';
import { requestContext } from '../../common/http';
import { asyncHandler } from '../../common/validate';
import { authenticateOptional } from '../../middleware/authenticate';
import { setAuthCookies } from '../auth/cookies';
import { oauthService } from './oauth.service';
import { listProviders } from './identity-provider';

const appendQuery = (path: string, params: Record<string, string>): string => {
  const url = new URL(path.startsWith('/') ? path : '/', env.appOrigin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

const errorCodeOf = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return 'oauth_failed';
};

export const oauthRoutes = Router();

/** 让前端知道有哪些登录方式可用 */
oauthRoutes.get('/providers', (_req, res) => {
  res.json({ providers: listProviders() });
});

/**
 * 发起第三方登录：
 *   GET /user/oauth/github/authorize?redirect=/settings
 *   GET /user/oauth/github/authorize?link=1   （已登录用户主动绑定）
 *   GET ...&format=json                      （返回 URL 而不是 302）
 */
oauthRoutes.get(
  '/:provider/authorize',
  authenticateOptional,
  asyncHandler(async (req, res) => {
    const linkRequested = req.query['link'] === '1';
    if (linkRequested && !req.auth) {
      throw unauthorized('请先登录后再绑定第三方账号');
    }

    const url = await oauthService.buildAuthorizeUrl({
      providerName: String(req.params['provider']),
      linkUserId: linkRequested ? (req.auth?.userId ?? null) : null,
      redirectTo: typeof req.query['redirect'] === 'string' ? req.query['redirect'] : '/',
    });

    if (req.query['format'] === 'json') {
      res.json({ url });
      return;
    }

    res.redirect(302, url);
  }),
);

/**
 * 第三方回调：浏览器会直接跳转到这里，所以错误也要用 302 回到前端，
 * 不能返回 JSON（用户会看到一个裸 JSON 页面）。
 */
oauthRoutes.get(
  '/:provider/callback',
  asyncHandler(async (req, res) => {
    const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
    const state = typeof req.query['state'] === 'string' ? req.query['state'] : '';

    if (!code || !state) {
      res.redirect(302, appendQuery('/', { oauth_error: 'invalid_request' }));
      return;
    }

    try {
      const outcome = await oauthService.handleCallback({
        providerName: String(req.params['provider']),
        code,
        state,
        ctx: requestContext(req),
      });

      if (outcome.kind === 'link_required') {
        res.redirect(
          302,
          appendQuery('/', {
            oauth_error: 'link_required',
            provider: outcome.provider,
            email: outcome.email ?? '',
          }),
        );
        return;
      }

      const session = outcome.session;
      if (!session) {
        res.redirect(302, appendQuery('/', { oauth_error: 'oauth_failed' }));
        return;
      }

      const csrfToken = randomToken(24);
      setAuthCookies(res, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        csrfToken,
        accessExpiresInSeconds: session.accessExpiresInSeconds,
        refreshExpiresInSeconds: session.refreshExpiresInSeconds,
      });

      res.redirect(302, appendQuery(outcome.redirectTo, { oauth: 'ok' }));
    } catch (error) {
      res.redirect(302, appendQuery('/', { oauth_error: errorCodeOf(error) }));
    }
  }),
);
