import crypto from 'node:crypto';
import { ulid } from 'ulid';

/** 26 位、按时间有序、无碰撞风险的主键。 */
export const newId = (): string => ulid();

export const sha256Hex = (value: string): string =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex');

export const hmacSha256Hex = (secret: string, value: string): string =>
  crypto.createHmac('sha256', secret).update(value, 'utf8').digest('hex');

/** 用于 refresh token / OAuth state / PKCE verifier 的高熵随机串。 */
export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

export const sha256Base64Url = (value: string): string =>
  crypto.createHash('sha256').update(value, 'utf8').digest('base64url');

/** 生成指定位数的纯数字验证码（使用 CSPRNG）。 */
export const randomNumericCode = (length: number): string => {
  let code = '';
  while (code.length < length) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
};

/** 常量时间比较，长度不同时也保持恒定开销。 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

/** 邮箱归一化：注册、登录、发码三处必须使用同一规则，否则会出现「找不到用户」。 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** 截断写库字段，避免超长 user-agent 触发 SQL 报错。 */
export const truncate = (value: string | undefined | null, max: number): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};
