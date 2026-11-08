import fs from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import type { UserRole } from '../user/user.types';

loadEnv();

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

/** .env 里写成 `FOO=` 等同于未配置，避免空字符串触发格式校验 */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().trim().toLowerCase().email('预置账号邮箱格式不正确').optional(),
);
const optionalSecret = z.preprocess(emptyToUndefined, z.string().optional());
const optionalFilePath = z.preprocess(emptyToUndefined, z.string().optional());

/** 预置账号：由 env 注入，启动时幂等写入 */
export interface BootstrapAccount {
  role: UserRole;
  email: string;
  password: string;
}

/** 固定的三个槽位：1 admin + 2 supervisor */
const BOOTSTRAP_SLOTS = [
  {
    name: 'ADMIN',
    role: 'admin',
    emailKey: 'BOOTSTRAP_ADMIN_EMAIL',
    passwordKey: 'BOOTSTRAP_ADMIN_PASSWORD',
    fileKey: 'BOOTSTRAP_ADMIN_PASSWORD_FILE',
  },
  {
    name: 'SUPERVISOR_1',
    role: 'supervisor',
    emailKey: 'BOOTSTRAP_SUPERVISOR_1_EMAIL',
    passwordKey: 'BOOTSTRAP_SUPERVISOR_1_PASSWORD',
    fileKey: 'BOOTSTRAP_SUPERVISOR_1_PASSWORD_FILE',
  },
  {
    name: 'SUPERVISOR_2',
    role: 'supervisor',
    emailKey: 'BOOTSTRAP_SUPERVISOR_2_EMAIL',
    passwordKey: 'BOOTSTRAP_SUPERVISOR_2_PASSWORD',
    fileKey: 'BOOTSTRAP_SUPERVISOR_2_PASSWORD_FILE',
  },
] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),

  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),

  MYSQL_HOST: z.string().default('127.0.0.1'),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().default('root'),
  MYSQL_PASSWORD: z.string().default(''),
  MYSQL_DATABASE: z.string().default('summer_camp'),
  MYSQL_POOL_SIZE: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少需要 32 个字符'),
  JWT_ISSUER: z.string().default('summer-camp'),
  JWT_AUDIENCE: z.string().default('summer-camp-web'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).default(30),

  ACCESS_COOKIE_NAME: z.string().default('sc_at'),
  REFRESH_COOKIE_NAME: z.string().default('sc_rt'),
  CSRF_COOKIE_NAME: z.string().default('sc_csrf'),
  REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  COOKIE_DOMAIN: z.string().optional(),

  PASSWORD_HASH_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  OTP_SECRET: z.string().min(16, 'OTP_SECRET 至少需要 16 个字符'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  MAIL_FROM: z.string().default('Summer Camp <no-reply@localhost>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanString.default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().optional(),

  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  OIDC_SCOPES: z.string().default('openid profile email'),

  AUTH_ENFORCE_TRUSTED_ORIGIN: booleanString.default('true'),

  // ---------- 预置账号（bootstrap）----------
  // 配了 EMAIL 就必须配 PASSWORD 或 PASSWORD_FILE（成对校验见下方 superRefine）
  BOOTSTRAP_ON_START: booleanString.default('false'),
  BOOTSTRAP_ENFORCE_ROLE: booleanString.default('false'),

  BOOTSTRAP_ADMIN_EMAIL: optionalEmail,
  BOOTSTRAP_ADMIN_PASSWORD: optionalSecret,
  BOOTSTRAP_ADMIN_PASSWORD_FILE: optionalFilePath,

  BOOTSTRAP_SUPERVISOR_1_EMAIL: optionalEmail,
  BOOTSTRAP_SUPERVISOR_1_PASSWORD: optionalSecret,
  BOOTSTRAP_SUPERVISOR_1_PASSWORD_FILE: optionalFilePath,

  BOOTSTRAP_SUPERVISOR_2_EMAIL: optionalEmail,
  BOOTSTRAP_SUPERVISOR_2_PASSWORD: optionalSecret,
  BOOTSTRAP_SUPERVISOR_2_PASSWORD_FILE: optionalFilePath,
}).superRefine((value, ctx) => {
  for (const def of BOOTSTRAP_SLOTS) {
    const email = value[def.emailKey];
    const hasPassword =
      value[def.passwordKey] !== undefined || value[def.fileKey] !== undefined;

    if (email && !hasPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [def.emailKey],
        message: `配置了 ${def.emailKey} 但缺少 ${def.passwordKey}（或 ${def.fileKey}）`,
      });
    }
    if (!email && hasPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [def.emailKey],
        message: `配置了 ${def.passwordKey} 但没有 ${def.emailKey}`,
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`环境变量配置有误，请对照 .env.example 检查：\n${detail}`);
}

const raw = parsed.data;

/** 读 Docker secret / k8s Secret 挂载出来的文件；`*_FILE` 优先于明文变量 */
const readSecretFile = (filePath: string, key: string): string => {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (content.length === 0) throw new Error('文件内容为空');
    return content;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${key} 指向的文件无法读取（${filePath}）：${reason}\n` +
        `  提示：本地开发请删除该 *_FILE 变量，直接用明文变量；` +
        `只有 Docker / k8s 挂载 secret 时才需要它（且它优先于明文密码）`,
    );
  }
};

const buildBootstrapAccounts = (): BootstrapAccount[] => {
  const accounts: BootstrapAccount[] = [];
  const seenEmails = new Set<string>();

  for (const def of BOOTSTRAP_SLOTS) {
    const email = raw[def.emailKey];
    if (!email) continue;

    const passwordFile = raw[def.fileKey];
    const password = passwordFile
      ? readSecretFile(passwordFile, def.fileKey)
      : raw[def.passwordKey];
    // 成对校验已在 schema 里做过，这里只是类型兜底
    if (!password) continue;

    if (password.length < 16) {
      throw new Error(`${def.passwordKey} 至少需要 16 个字符`);
    }
    // bcrypt 只使用前 72 字节，超长会被静默截断，直接报错更安全
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error(`${def.passwordKey} 超过 bcrypt 的 72 字节上限`);
    }
    if (seenEmails.has(email)) {
      throw new Error(`预置账号邮箱重复：${email}`);
    }

    seenEmails.add(email);
    accounts.push({ role: def.role, email, password });
  }

  return accounts;
};

const bootstrapAccounts = buildBootstrapAccounts();

const corsOrigins = raw.CORS_ORIGINS.split(',')
  .map((item) => item.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  logLevel: raw.LOG_LEVEL,

  appOrigin: raw.APP_ORIGIN,
  publicBaseUrl: raw.PUBLIC_BASE_URL.replace(/\/$/, ''),
  corsOrigins,

  mysql: {
    host: raw.MYSQL_HOST,
    port: raw.MYSQL_PORT,
    user: raw.MYSQL_USER,
    password: raw.MYSQL_PASSWORD,
    database: raw.MYSQL_DATABASE,
    poolSize: raw.MYSQL_POOL_SIZE,
  },

  jwt: {
    secret: raw.JWT_SECRET,
    issuer: raw.JWT_ISSUER,
    audience: raw.JWT_AUDIENCE,
    accessTtlSeconds: raw.JWT_ACCESS_TTL_SECONDS,
    clockToleranceSeconds: raw.JWT_CLOCK_TOLERANCE_SECONDS,
  },

  cookie: {
    accessName: raw.ACCESS_COOKIE_NAME,
    refreshName: raw.REFRESH_COOKIE_NAME,
    csrfName: raw.CSRF_COOKIE_NAME,
    refreshTtlSeconds: raw.REFRESH_TTL_SECONDS,
    domain: raw.COOKIE_DOMAIN,
    secure: raw.NODE_ENV === 'production',
  },

  password: {
    rounds: raw.PASSWORD_HASH_ROUNDS,
  },

  otp: {
    secret: raw.OTP_SECRET,
    ttlSeconds: raw.OTP_TTL_SECONDS,
    resendCooldownSeconds: raw.OTP_RESEND_COOLDOWN_SECONDS,
    maxAttempts: raw.OTP_MAX_ATTEMPTS,
    length: 6,
  },

  mail: {
    from: raw.MAIL_FROM,
    smtp: raw.SMTP_HOST
      ? {
          host: raw.SMTP_HOST,
          port: raw.SMTP_PORT,
          secure: raw.SMTP_SECURE,
          user: raw.SMTP_USER,
          password: raw.SMTP_PASSWORD,
        }
      : null,
  },

  github: {
    clientId: raw.GITHUB_CLIENT_ID,
    clientSecret: raw.GITHUB_CLIENT_SECRET,
    redirectUri: raw.GITHUB_REDIRECT_URI ?? `${raw.PUBLIC_BASE_URL}/user/oauth/github/callback`,
  },

  oidc: {
    issuer: raw.OIDC_ISSUER,
    clientId: raw.OIDC_CLIENT_ID,
    clientSecret: raw.OIDC_CLIENT_SECRET,
    redirectUri: raw.OIDC_REDIRECT_URI ?? `${raw.PUBLIC_BASE_URL}/user/oauth/oidc/callback`,
    scopes: raw.OIDC_SCOPES,
  },

  auth: {
    enforceTrustedOrigin: raw.AUTH_ENFORCE_TRUSTED_ORIGIN,
  },

  bootstrap: {
    /** 启动时自动 seed（多副本部署请关掉，改用 npm run seed:accounts） */
    onStart: raw.BOOTSTRAP_ON_START,
    /** 已有账号角色不一致时是否强制纠正；默认只 WARN 不修改 */
    enforceRole: raw.BOOTSTRAP_ENFORCE_ROLE,
    accounts: bootstrapAccounts,
  },
} as const;

export type Env = typeof env;
