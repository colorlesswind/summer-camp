import { AppError, internal } from '../common/errors';
import { logger } from '../common/logger';
import { normalizeEmail } from '../common/crypto';
import { env, type BootstrapAccount } from '../config';
import { auditLog } from '../infra/audit.log';
import { passwordService } from '../user/auth/password.service';
import { passwordRepository, usersRepository } from '../user/user.repository';
import type { UserRole } from '../user/user.types';

/**
 * 预置账号（1 admin + 2 supervisor）的幂等初始化。
 *
 * 触发点有两个，逻辑只有这一份：
 *   1. 进程启动时：BOOTSTRAP_ON_START=true 时由 index.ts 调用
 *   2. 手动/initContainer：npm run seed:accounts（或 node dist/bootstrap/seed-cli.js）
 *
 * 幂等规则：
 *   - 不存在            -> 创建（role + 已验邮箱 + 密码，一次事务写入）
 *   - 存在、角色一致    -> 只补齐缺失的部分（邮箱验证 / 密码凭证），不覆盖已有密码
 *   - 存在、角色不一致  -> 默认只 WARN，不动账号；BOOTSTRAP_ENFORCE_ROLE=true 才纠正
 *   - 已有密码          -> 永不重置（避免每次重启把运维改过的密码冲掉）
 */

export type BootstrapAction = 'created' | 'skipped' | 'repaired' | 'warned';

export interface BootstrapOutcome {
  email: string;
  role: UserRole;
  action: BootstrapAction;
  notes: string[];
}

export interface BootstrapResult {
  outcomes: BootstrapOutcome[];
  created: number;
  repaired: number;
  skipped: number;
  warned: number;
}

export interface SeedOptions {
  /** 覆盖配置里的 BOOTSTRAP_ENFORCE_ROLE */
  enforceRole?: boolean;
}

const report = async (outcome: BootstrapOutcome): Promise<BootstrapOutcome> => {
  await auditLog.write({
    event: 'bootstrap_account',
    result: outcome.action === 'warned' ? 'failure' : 'success',
    email: outcome.email,
    meta: { role: outcome.role, action: outcome.action, notes: outcome.notes },
  });

  const payload = {
    email: outcome.email,
    role: outcome.role,
    action: outcome.action,
    notes: outcome.notes,
  };
  if (outcome.action === 'warned') {
    logger.warn(payload, 'bootstrap account needs attention');
  } else {
    logger.info(payload, 'bootstrap account ready');
  }

  return outcome;
};

const seedOne = async (
  account: BootstrapAccount,
  enforceRole: boolean,
  now: Date,
): Promise<BootstrapOutcome> => {
  const email = normalizeEmail(account.email);
  const notes: string[] = [];

  let user = await usersRepository.findByEmail(email);
  let created = false;

  if (!user) {
    const passwordHash = await passwordService.hash(account.password);
    try {
      user = await usersRepository.create({
        email,
        passwordHash,
        emailVerifiedAt: now,
        role: account.role,
      });
      created = true;
    } catch (error) {
      // 多副本同时启动：另一个实例刚建好这个账号
      if (!(error instanceof AppError) || error.status !== 409) throw error;
      user = await usersRepository.findByEmail(email);
      if (!user) throw internal(`预置账号创建后读取失败：${email}`);
    }
  }

  if (!user) throw internal(`预置账号读取失败：${email}`);

  if (created) {
    return report({
      email,
      role: account.role,
      action: 'created',
      notes: ['已创建账号，邮箱标记为已验证'],
    });
  }

  // ---- 以下都是「账号已存在」----

  if (user.role !== account.role) {
    if (!enforceRole) {
      return report({
        email,
        role: user.role,
        action: 'warned',
        notes: [
          `角色不一致：期望 ${account.role}，实际 ${user.role}；未做修改`,
          '如需纠正，设置 BOOTSTRAP_ENFORCE_ROLE=true 后重新执行一次',
        ],
      });
    }
    await usersRepository.updateRole(user.id, account.role);
    user.role = account.role;
    notes.push(`角色已纠正为 ${account.role}`);
  }

  let repaired = notes.length > 0;

  if (!user.email_verified_at) {
    await usersRepository.markEmailVerified(user.id, now);
    notes.push('已补标记邮箱验证');
    repaired = true;
  }

  const existingHash = await passwordRepository.getHash(user.id);
  if (!existingHash) {
    await passwordRepository.upsert(user.id, await passwordService.hash(account.password));
    notes.push('已补写密码凭证');
    repaired = true;
  }

  if (!repaired) {
    notes.push('账号已存在且可登录，保持不变');
  }

  return report({
    email,
    role: user.role,
    action: repaired ? 'repaired' : 'skipped',
    notes,
  });
};

const summarize = (outcomes: BootstrapOutcome[]): BootstrapResult => ({
  outcomes,
  created: outcomes.filter((item) => item.action === 'created').length,
  repaired: outcomes.filter((item) => item.action === 'repaired').length,
  skipped: outcomes.filter((item) => item.action === 'skipped').length,
  warned: outcomes.filter((item) => item.action === 'warned').length,
});

export const seedBootstrapAccounts = async (
  accounts: readonly BootstrapAccount[] = env.bootstrap.accounts,
  options: SeedOptions = {},
): Promise<BootstrapResult> => {
  const enforceRole = options.enforceRole ?? env.bootstrap.enforceRole;
  const now = new Date();
  const outcomes: BootstrapOutcome[] = [];

  for (const account of accounts) {
    outcomes.push(await seedOne(account, enforceRole, now));
  }

  return summarize(outcomes);
};
