/**
 * 本地预览验证码邮件的真实内容（不发信、不连 SMTP）。
 * 用法：npx tsx scripts/mail-preview.ts
 */
import nodemailer from 'nodemailer';

// 把 nodemailer 的传输层替换成「只打印不发送」，其它逻辑完全走项目里的真实实现
(nodemailer as unknown as { createTransport: (o: unknown) => unknown }).createTransport = () => ({
  sendMail: async (mail: { from?: string; to?: string; subject?: string; text?: string }) => {
    console.log('=== transport: preview-only ===');
    console.log('FROM   :', mail.from);
    console.log('TO     :', mail.to);
    console.log('SUBJECT:', mail.subject);
    console.log('--- BODY ---');
    console.log(mail.text);
    console.log('--- END ---');
    return { messageId: 'preview-only' };
  },
});

async function main(): Promise<void> {
  const { mailService } = await import('../src/user/auth/mail.service');
  await mailService.sendOtp({
    to: '635713799@qq.com',
    code: '246810',
    purpose: 'verify_email',
    expiresInMinutes: 10,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
