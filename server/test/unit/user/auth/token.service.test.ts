import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '@src/config';
import { tokenService } from '@src/user/auth/token.service';

const sign = (payload: Record<string, unknown>, over: jwt.SignOptions = {}): string =>
  jwt.sign(payload, env.jwt.secret, {
    algorithm: 'HS256',
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    subject: 'user-1',
    jwtid: 'jti-1',
    expiresIn: 900,
    ...over,
  });

describe('signAccessToken', () => {
  it('返回 token / jti / 过期时间，TTL 与配置一致', () => {
    const before = Date.now();
    const signed = tokenService.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      amr: ['password'],
    });

    expect(signed.token.split('.')).toHaveLength(3);
    expect(signed.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(signed.expiresInSeconds).toBe(env.jwt.accessTtlSeconds);
    expect(signed.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + env.jwt.accessTtlSeconds * 1000,
    );
  });

  it('每次签发 jti 都不同', () => {
    const a = tokenService.signAccessToken({ userId: 'u', sessionId: 's', amr: ['otp'] });
    const b = tokenService.signAccessToken({ userId: 'u', sessionId: 's', amr: ['otp'] });
    expect(a.jti).not.toBe(b.jti);
    expect(a.token).not.toBe(b.token);
  });

  it('claims 里带 sub / sid / amr / typ，且 iss / aud 正确', () => {
    const signed = tokenService.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      amr: ['github'],
    });
    const decoded = jwt.decode(signed.token) as jwt.JwtPayload;

    expect(decoded).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
      amr: ['github'],
      typ: 'access',
      iss: env.jwt.issuer,
      aud: env.jwt.audience,
      jti: signed.jti,
    });
    expect(decoded.exp! - decoded.iat!).toBe(env.jwt.accessTtlSeconds);
  });
});

describe('verifyAccessToken', () => {
  it('签发 -> 校验 的往返一致', async () => {
    const signed = tokenService.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      amr: ['password', 'otp'],
    });

    const claims = await tokenService.verifyAccessToken(signed.token);

    expect(claims).toMatchObject({
      sub: 'user-1',
      jti: signed.jti,
      sid: 'session-1',
      amr: ['password', 'otp'],
      iss: env.jwt.issuer,
      aud: env.jwt.audience,
      typ: 'access',
    });
    expect(typeof claims.exp).toBe('number');
    expect(typeof claims.iat).toBe('number');
  });

  it('签名密钥不对 -> 401 invalid_grant 风格（不区分原因）', async () => {
    const token = jwt.sign({ sid: 's', amr: [], typ: 'access' }, 'another-secret-another-secret-1234', {
      algorithm: 'HS256',
      subject: 'user-1',
      jwtid: 'jti-1',
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });

    await expect(tokenService.verifyAccessToken(token)).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
      message: '登录状态已失效，请重新登录',
    });
  });

  it('已过期 -> 401（超出 clockTolerance 才算过期）', async () => {
    const token = sign({ sid: 's', amr: [] }, { expiresIn: -(env.jwt.clockToleranceSeconds + 30) });
    await expect(tokenService.verifyAccessToken(token)).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });

  it('刚过期但还在 clockTolerance 内 -> 仍然接受（容忍部署机时钟漂移）', async () => {
    const token = sign({ sid: 's', amr: [] }, { expiresIn: -5 });
    await expect(tokenService.verifyAccessToken(token)).resolves.toMatchObject({ sub: 'user-1' });
  });

  it('issuer 不匹配 -> 401', async () => {
    const token = sign({ sid: 's', amr: [] }, { issuer: 'evil-issuer' });
    await expect(tokenService.verifyAccessToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it('audience 不匹配 -> 401', async () => {
    const token = sign({ sid: 's', amr: [] }, { audience: 'other-audience' });
    await expect(tokenService.verifyAccessToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it('缺少 sid / jti 的 token 即使签名正确也拒绝', async () => {
    const noSid = sign({ amr: [] });
    await expect(tokenService.verifyAccessToken(noSid)).rejects.toMatchObject({ status: 401 });

    const noJti = jwt.sign(
      { sid: 's', amr: [], typ: 'access' },
      env.jwt.secret,
      {
        algorithm: 'HS256',
        subject: 'user-1',
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
        expiresIn: 900,
      },
    );
    await expect(tokenService.verifyAccessToken(noJti)).rejects.toMatchObject({ status: 401 });
  });

  it('amr 兼容字符串形式（老 token）并过滤非法值', async () => {
    const token = sign({ sid: 's', amr: 'otp, github, evil-method' });
    const claims = await tokenService.verifyAccessToken(token);
    expect(claims.amr).toEqual(['otp', 'github']);
  });

  it('amr 缺失时返回空数组', async () => {
    const token = sign({ sid: 's' });
    await expect(tokenService.verifyAccessToken(token)).resolves.toMatchObject({ amr: [] });
  });

  it('随机字符串 -> 401', async () => {
    await expect(tokenService.verifyAccessToken('not.a.jwt')).rejects.toMatchObject({ status: 401 });
  });
});
