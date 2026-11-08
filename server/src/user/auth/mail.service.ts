import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config';
import { logger } from '../../common/logger';
import type { OtpPurpose } from '../user.types';

export interface OtpMailPayload {
  to: string;
  code: string;
  purpose: OtpPurpose;
  expiresInMinutes: number;
}

export interface MailService {
  sendOtp(payload: OtpMailPayload): Promise<void>;
  sendNotice(payload: { to: string; subject: string; text: string }): Promise<void>;
}

const purposeText: Record<OtpPurpose, string> = {
  logon: '登录',
  verify_email: '验证邮箱',
  reset_password: '重置密码',
};

const purposeIntro: Record<OtpPurpose, string> = {
  logon: '你正在使用邮箱验证码登录 Summer Camp。',
  verify_email: '欢迎注册 Summer Camp，请验证你的邮箱。',
  reset_password: '你正在重置 Summer Camp 的登录密码。',
};

/**
 * 开发环境未配置 SMTP 时的兜底实现：把验证码打到日志里。
 * 生产环境请务必配置 SMTP_HOST，否则验证码发不出去。
 */
class LogMailService implements MailService {
  async sendOtp(payload: OtpMailPayload): Promise<void> {
    logger.warn(
      { to: payload.to, purpose: payload.purpose },
      `[DEV MAIL] ${purposeText[payload.purpose]}验证码 ${payload.code}（${payload.expiresInMinutes} 分钟内有效）`,
    );
  }

  async sendNotice(payload: { to: string; subject: string; text: string }): Promise<void> {
    logger.info({ to: payload.to }, `[DEV MAIL] ${payload.subject}: ${payload.text}`);
  }
}

class SmtpMailService implements MailService {
  private readonly transporter: Transporter;

  constructor(
    private readonly from: string,
    smtp: NonNullable<typeof env.mail.smtp>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? '' } : undefined,
    });
  }

  async sendOtp(payload: OtpMailPayload): Promise<void> {
    const minutes = payload.expiresInMinutes;
    await this.transporter.sendMail({
      from: this.from,
      to: payload.to,
      subject: `[Summer Camp] ${purposeText[payload.purpose]}验证码 ${payload.code}`,
      text: [
        purposeIntro[payload.purpose],
        '',
        `验证码：${payload.code}`,
        `有效期：${minutes} 分钟，仅可使用一次。`,
        '',
        '如果这不是你本人的操作，请忽略本邮件。',
      ].join('\n'),
    });
  }

  async sendNotice(payload: { to: string; subject: string; text: string }): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: payload.to,
      subject: `[Summer Camp] ${payload.subject}`,
      text: payload.text,
    });
  }
}

export const mailService: MailService = env.mail.smtp
  ? new SmtpMailService(env.mail.from, env.mail.smtp)
  : new LogMailService();

export const isMailConfigured = env.mail.smtp !== null;
