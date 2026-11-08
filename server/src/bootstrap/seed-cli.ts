/**
 * 预置账号初始化命令。
 *
 *   npm run seed:accounts            # 开发环境（tsx 直跑源码）
 *   node dist/bootstrap/seed-cli.js  # 生产镜像（无 devDependencies 时用这个）
 *
 * 幂等：重复执行不会重复建号，也不会覆盖已有密码。
 * 任一账号处理失败时退出码为 1，方便 CI / k8s Job 感知。
 */
import { logger } from '../common/logger';
import { env } from '../config';
import { closePool } from '../db/pool';
import { seedBootstrapAccounts } from './accounts';

const main = async (): Promise<void> => {
  if (env.bootstrap.accounts.length === 0) {
    logger.warn('未配置任何 BOOTSTRAP_* 账号，跳过');
    return;
  }

  const result = await seedBootstrapAccounts();

  for (const outcome of result.outcomes) {
    const notes = outcome.notes.join('；');
    console.log(
      `[${outcome.action.padEnd(8)}] ${outcome.role.padEnd(10)} ${outcome.email}` +
        (notes ? `  — ${notes}` : ''),
    );
  }

  console.log(
    `\n合计：创建 ${result.created}，修复 ${result.repaired}，跳过 ${result.skipped}，告警 ${result.warned}`,
  );

  if (result.warned > 0) {
    logger.warn('存在需要人工确认的预置账号，详见上方 WARN 日志与 auth_audit 表');
  }
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    logger.error({ err: error }, 'bootstrap accounts failed');
    process.exitCode = 1;
  } finally {
    await closePool();
  }
};

void run();
