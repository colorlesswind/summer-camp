import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  emailSchema,
  logonSchema,
  otpCodeSchema,
  otpRequestSchema,
  passwordSchema,
  registerSchema,
  verifyEmailSchema,
} from '@src/user/user.schema';

const issuesOf = (result: { success: boolean; error?: { issues: Array<{ path: (string | number)[]; message: string }> } }) =>
  result.success ? [] : (result.error?.issues ?? []);

describe('emailSchema', () => {
  it('trim + 小写化 + 校验格式', () => {
    expect(emailSchema.parse('  Foo.Bar@Example.COM ')).toBe('foo.bar@example.com');
  });

  it('拒绝非法邮箱 / 过短 / 过长', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse('a@b').success).toBe(false);
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@example.com`).success).toBe(false);
  });

  it('拒绝非字符串', () => {
    expect(emailSchema.safeParse(undefined).success).toBe(false);
    expect(issuesOf(emailSchema.safeParse(undefined))[0]?.message).toBe('请填写邮箱');
  });
});

describe('passwordSchema', () => {
  it('8-128 位', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(128)).success).toBe(true);
  });

  it('错误文案可读', () => {
    expect(issuesOf(passwordSchema.safeParse('short'))[0]?.message).toBe('密码至少 8 位');
  });
});

describe('otpCodeSchema', () => {
  it('只接受 6 位数字（前后空格会被 trim）', () => {
    expect(otpCodeSchema.parse(' 123456 ')).toBe('123456');
    expect(otpCodeSchema.safeParse('12345').success).toBe(false);
    expect(otpCodeSchema.safeParse('1234567').success).toBe(false);
    expect(otpCodeSchema.safeParse('abcdef').success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('合法注册入参', () => {
    expect(
      registerSchema.parse({ email: 'A@B.com', password: 'password1', displayName: '  Alice ' }),
    ).toEqual({ email: 'a@b.com', password: 'password1', displayName: 'Alice' });
  });

  it('displayName 可选', () => {
    const parsed = registerSchema.parse({ email: 'a@b.com', password: 'password1' });
    expect(parsed.displayName).toBeUndefined();
  });

  it('strict：拒绝未知字段（防止前端顺带传 role 提权）', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.com',
      password: 'password1',
      role: 'admin',
    });
    expect(result.success).toBe(false);
    expect(issuesOf(result)[0]?.message).toContain('Unrecognized key');
  });

  it('拒绝空昵称与超长昵称', () => {
    expect(registerSchema.safeParse({ email: 'a@b.com', password: 'password1', displayName: '  ' }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({ email: 'a@b.com', password: 'password1', displayName: 'x'.repeat(65) }).success,
    ).toBe(false);
  });
});

describe('otpRequestSchema', () => {
  it('purpose 缺省为 logon', () => {
    expect(otpRequestSchema.parse({ email: 'a@b.com' })).toEqual({ email: 'a@b.com', purpose: 'logon' });
  });

  it('只允许 logon / verify_email', () => {
    expect(otpRequestSchema.safeParse({ email: 'a@b.com', purpose: 'reset_password' }).success).toBe(false);
  });

  it('strict：拒绝未知字段', () => {
    expect(otpRequestSchema.safeParse({ email: 'a@b.com', purpose: 'logon', extra: 1 }).success).toBe(false);
  });
});

describe('logonSchema（discriminatedUnion on grant_type）', () => {
  it('password 分支', () => {
    expect(
      logonSchema.parse({ grant_type: 'password', email: ' A@B.com ', password: 'p' }),
    ).toEqual({ grant_type: 'password', email: 'a@b.com', password: 'p' });
  });

  it('otp 分支', () => {
    expect(logonSchema.parse({ grant_type: 'otp', email: 'a@b.com', otp: '123456' })).toEqual({
      grant_type: 'otp',
      email: 'a@b.com',
      otp: '123456',
    });
  });

  it('grant_type 必填且只能二选一', () => {
    expect(logonSchema.safeParse({ email: 'a@b.com', password: 'p' }).success).toBe(false);
    expect(logonSchema.safeParse({ grant_type: 'refresh', email: 'a@b.com' }).success).toBe(false);
  });

  it('password 分支不接受 otp 字段（strict 分支不混淆）', () => {
    expect(
      logonSchema.safeParse({ grant_type: 'password', email: 'a@b.com', password: 'p', otp: '123456' }).success,
    ).toBe(false);
  });

  it('otp 必须是 6 位数字', () => {
    expect(logonSchema.safeParse({ grant_type: 'otp', email: 'a@b.com', otp: '123' }).success).toBe(false);
  });
});

describe('verifyEmailSchema / changePasswordSchema', () => {
  it('verifyEmail 需要 email + 6 位 code', () => {
    expect(verifyEmailSchema.parse({ email: 'A@B.com', code: '123456' })).toEqual({
      email: 'a@b.com',
      code: '123456',
    });
    expect(verifyEmailSchema.safeParse({ email: 'a@b.com', code: '1234' }).success).toBe(false);
  });

  it('changePassword：currentPassword 可选，newPassword 必填且 >= 8', () => {
    expect(changePasswordSchema.parse({ newPassword: 'password1' })).toEqual({ newPassword: 'password1' });
    expect(
      changePasswordSchema.parse({ currentPassword: 'old-password', newPassword: 'password1' }),
    ).toEqual({ currentPassword: 'old-password', newPassword: 'password1' });
    expect(changePasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
  });
});
