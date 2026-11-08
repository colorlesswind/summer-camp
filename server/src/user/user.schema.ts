import { z } from 'zod';

export const emailSchema = z
  .string({ required_error: '请填写邮箱' })
  .trim()
  .toLowerCase()
  .min(3, '邮箱格式不正确')
  .max(255, '邮箱过长')
  .email('邮箱格式不正确');

export const passwordSchema = z
  .string({ required_error: '请填写密码' })
  .min(8, '密码至少 8 位')
  .max(128, '密码最多 128 位');

export const otpCodeSchema = z
  .string({ required_error: '请填写验证码' })
  .trim()
  .regex(/^\d{6}$/, '验证码为 6 位数字');

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1, '昵称不能为空').max(64, '昵称最多 64 个字符').optional(),
  })
  .strict();

export const otpRequestSchema = z
  .object({
    email: emailSchema,
    /** 现阶段只支持「登录」和「注册后验证邮箱」两种用途 */
    purpose: z.enum(['logon', 'verify_email']).default('logon'),
  })
  .strict();

export const logonSchema = z.discriminatedUnion('grant_type', [
  z
    .object({
      grant_type: z.literal('password'),
      email: emailSchema,
      password: z.string({ required_error: '请填写密码' }).min(1, '请填写密码').max(128),
    })
    .strict(),
  z
    .object({
      grant_type: z.literal('otp'),
      email: emailSchema,
      otp: otpCodeSchema,
    })
    .strict(),
]);

export const verifyEmailSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(128).optional(),
    newPassword: passwordSchema,
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type LogonInput = z.infer<typeof logonSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
