import type { PoolConnection } from 'mysql2/promise';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supervisorQuota } from '@src/form/form.quota';
import { AppError } from '@src/common/errors';

interface RecordedCall {
  sql: string;
  params: readonly unknown[];
}

/**
 * 假的 PoolConnection：只记录 SQL，并按 results 队列返回结果集。
 * 默认每次 execute 返回 affectedRows = 1，方便断言「占用成功」。
 */
const fakeConnection = () => {
  const calls: RecordedCall[] = [];
  const results: Array<[unknown, unknown]> = [];

  const execute = vi.fn(async (sql: string, params: readonly unknown[]) => {
    calls.push({ sql, params });
    return results.shift() ?? [{ affectedRows: 1 }, []];
  });

  return {
    calls,
    results,
    conn: { execute } as unknown as PoolConnection,
  };
};

const isAcquire = (call: RecordedCall): boolean => call.sql.includes('quota_used = quota_used + 1');
const isRelease = (call: RecordedCall): boolean => call.sql.includes('quota_used = quota_used - 1');

describe('supervisorQuota.acquire', () => {
  it('用条件原子更新占位（quota_used < quota_capacity）', async () => {
    const { calls, conn } = fakeConnection();
    const now = new Date('2026-03-01T00:00:00.000Z');

    await supervisorQuota.acquire(conn, 7, now);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('quota_used = quota_used + 1');
    expect(calls[0]!.sql).toContain('quota_used < quota_capacity');
    expect(calls[0]!.params).toEqual([now, 7]);
  });

  it('影响行数为 0 且名额已满 -> 409 quota_full，带容量与已用信息', async () => {
    const { calls, results, conn } = fakeConnection();
    results.push(
      [{ affectedRows: 0 }, []],
      [[{ name: 'Dr. A', quota_capacity: 50, quota_used: 50 }], []],
    );

    const error = await supervisorQuota.acquire(conn, 7, new Date()).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      status: 409,
      details: { code: 'quota_full', supervisorId: 7, capacity: 50, used: 50 },
    });
    expect((error as AppError).message).toContain('Dr. A');
    expect(calls).toHaveLength(2);
  });

  it('导师不存在 -> 400 invalid_option', async () => {
    const { results, conn } = fakeConnection();
    results.push([{ affectedRows: 0 }, []], [[], []]);

    await expect(supervisorQuota.acquire(conn, 999, new Date())).rejects.toMatchObject({
      status: 400,
      details: { code: 'invalid_option', supervisorId: 999 },
    });
  });
});

describe('supervisorQuota.release', () => {
  it('只在 quota_used > 0 时回退，重复释放不会变负数', async () => {
    const { calls, conn } = fakeConnection();

    await supervisorQuota.release(conn, 7, new Date());

    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('quota_used = quota_used - 1');
    expect(calls[0]!.sql).toContain('quota_used > 0');
  });
});

describe('supervisorQuota.transfer（Resubmit 换导师）', () => {
  let now: Date;

  beforeEach(() => {
    now = new Date('2026-03-01T00:00:00.000Z');
  });

  it('导师没变 -> 不发任何 SQL（不重复占用）', async () => {
    const { calls, conn } = fakeConnection();

    await supervisorQuota.transfer(conn, 7, 7, now);

    expect(calls).toHaveLength(0);
  });

  it('从「未占用」到新导师 -> 只占用', async () => {
    const { calls, conn } = fakeConnection();

    await supervisorQuota.transfer(conn, null, 7, now);

    expect(calls).toHaveLength(1);
    expect(isAcquire(calls[0]!)).toBe(true);
  });

  it('从旧导师到「无」-> 只释放', async () => {
    const { calls, conn } = fakeConnection();

    await supervisorQuota.transfer(conn, 7, null, now);

    expect(calls).toHaveLength(1);
    expect(isRelease(calls[0]!)).toBe(true);
  });

  it('旧 id < 新 id -> 先释放再占用（按 id 升序加锁）', async () => {
    const { calls, conn } = fakeConnection();

    await supervisorQuota.transfer(conn, 5, 7, now);

    expect(calls.map((call) => (isRelease(call) ? 'release' : 'acquire'))).toEqual([
      'release',
      'acquire',
    ]);
  });

  it('旧 id > 新 id -> 先占用再释放（按 id 升序加锁）', async () => {
    const { calls, conn } = fakeConnection();

    await supervisorQuota.transfer(conn, 7, 5, now);

    expect(calls.map((call) => (isRelease(call) ? 'release' : 'acquire'))).toEqual([
      'acquire',
      'release',
    ]);
  });

  it('新导师已满 -> 抛 quota_full 且不释放旧名额（交给事务回滚）', async () => {
    const { calls, results, conn } = fakeConnection();
    results.push(
      [{ affectedRows: 0 }, []],
      [[{ name: 'Dr. B', quota_capacity: 50, quota_used: 50 }], []],
    );

    await expect(supervisorQuota.transfer(conn, 7, 5, now)).rejects.toMatchObject({
      status: 409,
      details: { code: 'quota_full', supervisorId: 5 },
    });
    expect(calls.some(isRelease)).toBe(false);
  });
});
