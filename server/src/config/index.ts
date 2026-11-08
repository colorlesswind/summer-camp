import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`环境变量配置有误，请对照 .env.example 检查：\n${detail}`);
}

const raw = parsed.data;

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
} as const;

export type Env = typeof env;
