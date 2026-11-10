import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@src/db/pool', () => ({
  pool: { execute: vi.fn() },
  withTransaction: vi.fn(),
}));

import { rateLimitStore } from '@src/infra/rate-limit.store';
import { pool, withTransaction } from '@src/db/pool';

const runTransaction = vi.mocked(withTransaction);
const execute = vi.mocked(pool.execute);

interface FakeConn {
  execute: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
}

const makeConn = (count: number): FakeConn => {
  const conn: FakeConn = {
    execute: vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return [[{ total: count }], []];
      return [{ affectedRows: 0 }, []];
    }),
    rollback: vi.fn(async () => undefined),
  };
  return conn;
};

const wire = (conn: FakeConn) => {
  runTransaction.mockImplementation(async (fn) => fn(conn as never));
};

beforeEach(() => {
  vi.clearAllMocks();
  execute.mockResolvedValue([{ affectedRows: 0 }, []] as never);
});

describe('rateLimitStore.consume（MySQL 滑动窗口实现）', () => {
  it('计数未超限 -> allowed=true，并给出剩余额度', async () => {
    const conn = makeConn(3);
    wire(conn);

    const result = await rateLimitStore.consume('logon:email:a@b.com', 10, 900);

    expect(result).toEqual({ allowed: true, count: 3, remaining: 7, retryAfterSeconds: 0 });
    expect(conn.execute).toHaveBeenCalledTimes(3);
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('计数恰好等于上限 -> 仍放行（第 limit 次成功，第 limit+1 次拒绝）', async () => {
    wire(makeConn(10));
    await expect(rateLimitStore.consume('b', 10, 900)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it('超出上限 -> allowed=false、remaining=0，并回滚本次计数写入', async () => {
    const conn = makeConn(11);
    wire(conn);

    const result = await rateLimitStore.consume('b', 10, 900);

    expect(result).toMatchObject({ allowed: false, count: 11, remaining: 0 });
    expect(result.retryAfterSeconds).toBe(450); // windowSeconds / 2
    expect(conn.rollback).toHaveBeenCalledTimes(1);
  });

  it('retryAfterSeconds 至少为 1 秒（窗口极短时不返回 0）', async () => {
    wire(makeConn(2));
    const result = await rateLimitStore.consume('b', 1, 1);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(1);
  });

  it('先清理窗口外的旧事件，再插入本次事件', async () => {
    const conn = makeConn(1);
    wire(conn);

    await rateLimitStore.consume('b', 5, 60);

    const sqls = conn.execute.mock.calls.map((call) => String(call[0]));
    expect(sqls[0]).toContain('DELETE FROM rate_limit_events');
    expect(sqls[1]).toContain('INSERT INTO rate_limit_events');
    expect(sqls[2]).toContain('COUNT(*)');
  });

  it('数据库异常向上抛（限流失败不能静默放行）', async () => {
    const conn = makeConn(1);
    conn.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT')) throw new Error('db down');
      return [{ affectedRows: 0 }, []];
    });
    wire(conn);

    await expect(rateLimitStore.consume('b', 5, 60)).rejects.toThrow('db down');
  });
});

describe('rateLimitStore.clear', () => {
  it('按 bucket 删除计数', async () => {
    await rateLimitStore.clear('logon:email:a@b.com');
    expect(execute).toHaveBeenCalledWith('DELETE FROM rate_limit_events WHERE bucket = ?', [
      'logon:email:a@b.com',
    ]);
  });
});

describe('rateLimitStore.replace（可插拔存储）', () => {
  it('替换后委托给新实现，便于将来切 Redis / 内存实现', async () => {
    const replacement = {
      consume: vi.fn(async () => ({ allowed: true, count: 0, remaining: 99, retryAfterSeconds: 0 })),
      clear: vi.fn(async () => undefined),
    };

    // 这个用例放在文件最后：替换后本文件不再需要 MySQL 实现（vitest 每个测试文件独立进程/模块表）
    rateLimitStore.replace(replacement);

    await expect(rateLimitStore.consume('bucket', 100, 60)).resolves.toMatchObject({ allowed: true });
    await rateLimitStore.clear('bucket');

    expect(replacement.consume).toHaveBeenCalledWith('bucket', 100, 60);
    expect(replacement.clear).toHaveBeenCalledWith('bucket');
    // 默认 MySQL 实现不再被触碰
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
