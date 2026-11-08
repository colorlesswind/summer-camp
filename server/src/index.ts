import { createApp } from './app';
import { env } from './config';
import { logger } from './common/logger';
import { closePool, pingDatabase } from './db/pool';
import { isMailConfigured } from './user/auth/mail.service';

async function main(): Promise<void> {
  if (env.isProduction && !isMailConfigured) {
    logger.error('生产环境未配置 SMTP，验证码将无法通过邮件送达，仅打印在日志中');
  }

  try {
    await pingDatabase();
    logger.info({ database: env.mysql.database }, 'database connected');
  } catch (error) {
    logger.error({ err: error }, 'database connection failed, server will still start');
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv, secureCookie: env.cookie.secure },
      `summer-camp API listening on http://localhost:${env.port}`,
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
    // 兜底：10 秒内没关干净就强退
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main().catch((error: unknown) => {
  logger.error({ err: error }, 'fatal startup error');
  process.exit(1);
});
