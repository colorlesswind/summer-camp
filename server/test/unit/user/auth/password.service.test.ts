import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { env } from '@src/config';
import { passwordService } from '@src/user/auth/password.service';

describe('passwordService', () => {
  it('hash 生成 bcrypt 串，使用配置的 cost', async () => {
    const hash = await passwordService.hash('correct horse battery staple');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${env.password.rounds}\\$`));
    expect(hash).not.toContain('correct horse');
  });

  it('同一密码每次 hash 都不同（默认随机 salt）', async () => {
    const a = await passwordService.hash('same-password');
    const b = await passwordService.hash('same-password');
    expect(a).not.toBe(b);
  });

  it('verify 对正确密码返回 true', async () => {
    const hash = await passwordService.hash('s3cret-password');
    await expect(passwordService.verify(hash, 's3cret-password')).resolves.toBe(true);
  });

  it('verify 对错误密码返回 false', async () => {
    const hash = await passwordService.hash('s3cret-password');
    await expect(passwordService.verify(hash, 's3cret-passworD')).resolves.toBe(false);
    await expect(passwordService.verify(hash, '')).resolves.toBe(false);
  });

  it('verify 对非法 hash 不抛异常，只返回 false', async () => {
    await expect(passwordService.verify('not-a-bcrypt-hash', 'whatever')).resolves.toBe(false);
    await expect(passwordService.verify('', 'whatever')).resolves.toBe(false);
  });

  it('dummyVerify 只消耗时间、不返回任何信息（用于抹平账号不存在时的时序差异）', async () => {
    await expect(passwordService.dummyVerify()).resolves.toBeUndefined();
  });

  it('bcrypt 只取前 72 字节：超过 72 字节的尾部差异不影响校验', async () => {
    const base = 'a'.repeat(72);
    const hash = await passwordService.hash(base);
    expect(await bcrypt.compare(`${base}different-tail`, hash)).toBe(true);
  });
});
