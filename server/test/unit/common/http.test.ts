import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { requestContext } from '@src/common/http';

const makeReq = (ip: string | undefined, userAgent: string | undefined): Request =>
  ({
    ip,
    get: (name: string) => (name.toLowerCase() === 'user-agent' ? userAgent : undefined),
  }) as unknown as Request;

describe('requestContext', () => {
  it('取 ip 与 user-agent', () => {
    expect(requestContext(makeReq('203.0.113.7', 'Mozilla/5.0'))).toEqual({
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('缺失时都是 null', () => {
    expect(requestContext(makeReq(undefined, undefined))).toEqual({ ip: null, userAgent: null });
  });

  it('ip 截断到 64 字符', () => {
    const { ip } = requestContext(makeReq('9'.repeat(100), undefined));
    expect(ip).toHaveLength(64);
  });

  it('user-agent 截断到 255 字符（避免超长 UA 打爆写库）', () => {
    const { userAgent } = requestContext(makeReq(undefined, 'u'.repeat(500)));
    expect(userAgent).toHaveLength(255);
  });

  it('空白 user-agent 归一成 null', () => {
    expect(requestContext(makeReq(undefined, '   ')).userAgent).toBeNull();
  });
});
