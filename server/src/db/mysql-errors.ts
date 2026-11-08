/** MySQL 唯一键冲突（ER_DUP_ENTRY）判定，用于把并发注册转成可读的业务错误。 */
export const isDuplicateEntry = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'ER_DUP_ENTRY';

export const mysqlErrorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? ((error as { code: string }).code)
    : null;
