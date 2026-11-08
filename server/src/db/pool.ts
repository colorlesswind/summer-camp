import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { env } from '../config';
import { logger } from '../common/logger';

/**
 * 全局连接池。
 * - timezone: 'Z' —— 应用层统一使用 UTC，避免部署机时区差异导致 token 过期时间错乱
 * - namedPlaceholders: false —— 统一使用 ? 占位符，全部走预处理语句，杜绝 SQL 注入
 */
export const pool: Pool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: env.mysql.poolSize,
  maxIdle: env.mysql.poolSize,
  queueLimit: 0,
  timezone: 'Z',
  charset: 'utf8mb4_unicode_ci',
  supportBigNumbers: true,
  bigNumberStrings: false,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch (rollbackError) {
      logger.error({ err: rollbackError }, 'rollback failed');
    }
    throw error;
  } finally {
    conn.release();
  }
}

export async function pingDatabase(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
