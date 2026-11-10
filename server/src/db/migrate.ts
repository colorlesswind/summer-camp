import fs from 'node:fs';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../config';
import { logger } from '../common/logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * 极简迁移器：
 *   - 自动建库
 *   - schema_migrations 记录已执行的文件
 *   - 单个 .sql 文件内以行尾分号切分语句（本项目不使用存储过程，足够安全）
 */
async function main(): Promise<void> {
  const conn = await mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    multipleStatements: false,
    timezone: 'Z',
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.mysql.database}\` ` +
        'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    await conn.changeUser({ database: env.mysql.database });

    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) NOT NULL,
        applied_at DATETIME(3)  NOT NULL,
        PRIMARY KEY (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await conn.query<RowDataPacket[]>('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((row) => String(row['filename'])));

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      throw new Error(`找不到迁移目录：${MIGRATIONS_DIR}`);
    }

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const statements = sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

      for (const statement of statements) {
        await conn.query(statement);
      }

      await conn.query('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)', [
        file,
        new Date(),
      ]);
      logger.info(`migration applied: ${file}`);
    }

    logger.info('database is up to date');
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'migration failed');
  process.exitCode = 1;
});
