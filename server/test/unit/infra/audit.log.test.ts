import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@src/db/pool', () => ({
  pool: { execute: vi.fn() },
}));
vi.mock('@src/common/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { auditLog } from '@src/infra/audit.log';
import { pool } from '@src/db/pool';
import { logger } from '@src/common/logger';

const execute = vi.mocked(pool.execute);

beforeEach(() => {
  vi.clearAllMocks();
  execute.mockResolvedValue([{ affectedRows: 1 }, []] as never);
});

describe('auditLog.write', () => {
  it('写入审计表，并把 meta 序列化成 JSON', async () => {
    await auditLog.write({
      event: 'logon',
      result: 'success',
      userId: 'user-1',
      email: 'a@b.com',
      ip: '203.0.113.9',
      userAgent: 'UA',
      meta: { grant: 'password' },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0]!;
    expect(String(sql)).toContain('INSERT INTO auth_audit');
    expect(params).toEqual([
      'user-1',
      'a@b.com',
      'logon',
      'success',
      '203.0.113.9',
      'UA',
      JSON.stringify({ grant: 'password' }),
      expect.any(Date),
    ]);
  });

  it('可选字段缺失时写 null', async () => {
    await auditLog.write({ event: 'logout', result: 'success' });

    const params = execute.mock.calls[0]![1] as unknown[];
    expect(params).toEqual([null, null, 'logout', 'success', null, null, null, expect.any(Date)]);
  });

  it('ip / user-agent 超长会截断（库字段 64 / 255）', async () => {
    await auditLog.write({
      event: 'logon',
      result: 'failure',
      ip: '1'.repeat(100),
      userAgent: 'u'.repeat(400),
    });

    const params = execute.mock.calls[0]![1] as unknown[];
    expect(params[4]).toHaveLength(64);
    expect(params[5]).toHaveLength(255);
  });

  it('数据库异常被吞掉（审计失败不能影响主流程），但会记 warn 日志', async () => {
    const boom = new Error('db down');
    execute.mockRejectedValue(boom);

    await expect(
      auditLog.write({ event: 'register', result: 'success', email: 'a@b.com' }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: boom, event: 'register' }),
      'audit write failed',
    );
  });
});
