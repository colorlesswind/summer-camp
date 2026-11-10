import { describe, expect, it } from 'vitest';
import { isDuplicateEntry, mysqlErrorCode } from '@src/db/mysql-errors';

describe('isDuplicateEntry', () => {
  it('识别 MySQL ER_DUP_ENTRY', () => {
    expect(isDuplicateEntry({ code: 'ER_DUP_ENTRY', errno: 1062 })).toBe(true);
  });

  it('其它 MySQL 错误 -> false', () => {
    expect(isDuplicateEntry({ code: 'ER_LOCK_DEADLOCK' })).toBe(false);
    expect(isDuplicateEntry({ code: 1062 })).toBe(false);
  });

  it('非对象 / null -> false（不会因为 null 崩掉错误处理链）', () => {
    expect(isDuplicateEntry(null)).toBe(false);
    expect(isDuplicateEntry(undefined)).toBe(false);
    expect(isDuplicateEntry('ER_DUP_ENTRY')).toBe(false);
    expect(isDuplicateEntry(42)).toBe(false);
  });
});

describe('mysqlErrorCode', () => {
  it('返回字符串错误码', () => {
    expect(mysqlErrorCode({ code: 'ER_DUP_ENTRY' })).toBe('ER_DUP_ENTRY');
  });

  it('没有可用 code -> null', () => {
    expect(mysqlErrorCode({ code: 1062 })).toBeNull();
    expect(mysqlErrorCode(new Error('x'))).toBeNull();
    expect(mysqlErrorCode(null)).toBeNull();
  });
});
