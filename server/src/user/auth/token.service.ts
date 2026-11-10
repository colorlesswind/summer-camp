import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config';
import { unauthorized } from '../../common/errors';
import type { AuthMethod } from '../user.types';

export interface AccessTokenClaims {
  sub: string;
  jti: string;
  sid: string;
  amr: AuthMethod[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  typ: 'access';
}

export interface SignAccessTokenInput {
  userId: string;
  sessionId: string;
  amr: AuthMethod[];
}

export interface SignedAccessToken {
  token: string;
  jti: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

const AMR_VALUES: readonly AuthMethod[] = ['password', 'otp', 'github', 'oidc'];

const toAuthMethods = (value: unknown): AuthMethod[] => {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item): item is AuthMethod => (AMR_VALUES as readonly string[]).includes(item));
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is AuthMethod =>
      typeof item === 'string' && (AMR_VALUES as readonly string[]).includes(item),
    );
  }
  return [];
};

/**
 * access token 签发/校验。
 *
 * 现在用 HS256（单服务，密钥只有自己知道）。
 * 若将来拆出多个服务，把这里换成 RS256/ES256 + JWKS 即可，业务代码不受影响。
 */
export const tokenService = {
  signAccessToken(input: SignAccessTokenInput): SignedAccessToken {
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      {
        sid: input.sessionId,
        amr: input.amr,
        typ: 'access',
      },
      env.jwt.secret,
      {
        algorithm: 'HS256',
        subject: input.userId,
        jwtid: jti,
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
        expiresIn: env.jwt.accessTtlSeconds,
      },
    );

    return {
      token,
      jti,
      expiresAt: new Date(Date.now() + env.jwt.accessTtlSeconds * 1000),
      expiresInSeconds: env.jwt.accessTtlSeconds,
    };
  },

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    let decoded: jwt.JwtPayload;

    try {
      decoded = jwt.verify(token, env.jwt.secret, {
        algorithms: ['HS256'],
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
        clockTolerance: env.jwt.clockToleranceSeconds,
      }) as jwt.JwtPayload;
    } catch {
      // 签名错 / 过期 / iss/aud 不匹配，一律不区分原因
      throw unauthorized('登录状态已失效，请重新登录');
    }

    const { sub, jti, sid, exp, iat } = decoded;
    if (typeof sub !== 'string' || typeof jti !== 'string' || typeof sid !== 'string') {
      throw unauthorized('登录状态已失效，请重新登录');
    }
    if (typeof exp !== 'number' || typeof iat !== 'number') {
      throw unauthorized('登录状态已失效，请重新登录');
    }

    return {
      sub,
      jti,
      sid,
      amr: toAuthMethods(decoded['amr']),
      iss: String(decoded.iss ?? ''),
      aud: String(decoded.aud ?? ''),
      iat,
      exp,
      typ: 'access',
    };
  },
};
