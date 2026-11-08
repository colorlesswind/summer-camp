import bcrypt from 'bcryptjs';
import { env } from '../../config';

/**
 * 密码哈希。
 *
 * 选型说明：这里使用 bcrypt(12) 而不是 argon2id —— bcryptjs 是纯 JS 实现，
 * Windows / 各种 CI 环境都不需要编译原生模块。若后续要换 argon2id，
 * 只需要改本文件的 hash/verify 两个方法并同步 password_credentials.algo。
 */
const DUMMY_PASSWORD = 'summer-camp-dummy-password-for-timing-safety';
const DUMMY_HASH = bcrypt.hashSync(DUMMY_PASSWORD, env.password.rounds);

export const passwordService = {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, env.password.rounds);
  },

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plain, hash);
    } catch {
      return false;
    }
  },

  /**
   * 用户不存在 / 没有设置密码时也跑一次 compare，
   * 让响应耗时与「密码错误」一致，避免通过时序枚举账号。
   */
  async dummyVerify(): Promise<void> {
    await bcrypt.compare(DUMMY_PASSWORD, DUMMY_HASH);
  },
};
