import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  hmacSha256Hex,
  newId,
  normalizeEmail,
  randomNumericCode,
  randomToken,
  sha256Base64Url,
  sha256Hex,
  timingSafeEqual,
  truncate,
} from '@src/common/crypto';

describe('newId', () => {
  it('生成 26 位 Crockford base32 的 ULID', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('连续调用不会重复', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
  });

  it('时间前缀随真实时间递增（可当作有序主键使用）', async () => {
    const first = newId();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = newId();
    expect(second.slice(0, 10) > first.slice(0, 10)).toBe(true);
    expect(second > first).toBe(true);
  });
});

describe('hash 系列', () => {
  it('sha256Hex 与 node:crypto 一致（已知向量）', () => {
    // sha256("abc")
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('sha256Hex 按 UTF-8 编码，中文不会算错', () => {
    expect(sha256Hex('夏令营')).toBe(createHash('sha256').update('夏令营', 'utf8').digest('hex'));
  });

  it('hmacSha256Hex 与 node:crypto 一致（RFC 4231 向量）', () => {
    expect(hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  it('hmacSha256Hex 对 key 敏感', () => {
    expect(hmacSha256Hex('key-1', 'payload')).not.toBe(hmacSha256Hex('key-2', 'payload'));
  });

  it('sha256Base64Url 输出 base64url（无 + / =）', () => {
    const digest = sha256Base64Url('some-verifier');
    expect(digest).toBe(
      createHash('sha256').update('some-verifier', 'utf8').digest('base64url'),
    );
    expect(digest).not.toMatch(/[+/=]/);
  });
});

describe('randomToken', () => {
  it('默认 32 字节 -> 43 个 base64url 字符', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('长度参数生效', () => {
    expect(randomToken(48)).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('每次生成都不同', () => {
    expect(new Set(Array.from({ length: 200 }, () => randomToken())).size).toBe(200);
  });
});

describe('randomNumericCode', () => {
  it('生成指定长度的纯数字', () => {
    const code = randomNumericCode(6);
    expect(code).toMatch(/^\d{6}$/);
    expect(randomNumericCode(4)).toMatch(/^\d{4}$/);
  });

  it('允许前导 0（按字符串补位而不是当数字）', () => {
    const codes = Array.from({ length: 300 }, () => randomNumericCode(6));
    expect(codes.every((code) => code.length === 6)).toBe(true);
    // 300 次采样里至少出现一次前导 0，否则说明实现丢掉了高位
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
  });
});

describe('timingSafeEqual', () => {
  it('相同字符串返回 true', () => {
    expect(timingSafeEqual('csrf-token-value', 'csrf-token-value')).toBe(true);
  });

  it('不同内容返回 false', () => {
    expect(timingSafeEqual('csrf-token-value', 'csrf-token-valu3')).toBe(false);
  });

  it('长度不同返回 false 且不抛异常', () => {
    expect(timingSafeEqual('short', 'much-longer-value')).toBe(false);
    expect(timingSafeEqual('', 'x')).toBe(false);
  });

  it('多字节字符按 UTF-8 字节比较', () => {
    expect(timingSafeEqual('验证码', '验证码')).toBe(true);
    expect(timingSafeEqual('验证码', '验证码 ')).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('去空格 + 转小写（注册/登录/发码必须同一规则）', () => {
    expect(normalizeEmail('  Foo.Bar@Example.COM  ')).toBe('foo.bar@example.com');
  });

  it('已归一化的值保持不变', () => {
    expect(normalizeEmail('a@b.com')).toBe('a@b.com');
  });
});

describe('truncate', () => {
  it('null / undefined / 空串 / 纯空白都返回 null', () => {
    expect(truncate(null, 10)).toBeNull();
    expect(truncate(undefined, 10)).toBeNull();
    expect(truncate('', 10)).toBeNull();
    expect(truncate('   ', 10)).toBeNull();
  });

  it('先 trim 再判断长度', () => {
    expect(truncate('  ua  ', 10)).toBe('ua');
    expect(truncate('0123456789abcdef', 10)).toBe('0123456789');
  });

  it('长度恰好等于上限时不截断', () => {
    expect(truncate('0123456789', 10)).toBe('0123456789');
  });
});
