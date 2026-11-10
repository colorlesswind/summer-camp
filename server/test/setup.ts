/**
 * 测试环境变量。
 *
 * src/config/index.ts 在模块加载时就用 zod 校验 process.env，并且会先执行 dotenv。
 * dotenv 默认不覆盖已存在的 process.env，所以这里显式写死一份「测试用」配置：
 * 测试既不依赖开发机的 .env，也不受它影响，结果可复现。
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  LOG_LEVEL: 'silent',

  APP_ORIGIN: 'http://localhost:5173',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',

  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '3306',
  MYSQL_USER: 'root',
  MYSQL_PASSWORD: '',
  MYSQL_DATABASE: 'summer_camp_test',
  MYSQL_POOL_SIZE: '2',

  JWT_SECRET: 'test-only-jwt-secret-at-least-32-characters!!',
  JWT_ISSUER: 'summer-camp',
  JWT_AUDIENCE: 'summer-camp-web',
  JWT_ACCESS_TTL_SECONDS: '900',
  JWT_CLOCK_TOLERANCE_SECONDS: '30',

  ACCESS_COOKIE_NAME: 'sc_at',
  REFRESH_COOKIE_NAME: 'sc_rt',
  CSRF_COOKIE_NAME: 'sc_csrf',
  REFRESH_TTL_SECONDS: '604800',

  // 单测里 bcrypt 用 10 轮即可，能快 4 倍且不影响语义
  PASSWORD_HASH_ROUNDS: '10',
  OTP_SECRET: 'test-only-otp-secret',
  OTP_TTL_SECONDS: '3600',
  OTP_RESEND_COOLDOWN_SECONDS: '60',
  OTP_MAX_ATTEMPTS: '5',

  MAIL_FROM: 'Summer Camp <no-reply@test.local>',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',

  // GitHub provider 的「已配置」分支要能测到，这里给一组假凭证；fetch 全被 mock，不会真的出网
  GITHUB_CLIENT_ID: 'test-github-client-id',
  GITHUB_CLIENT_SECRET: 'test-github-client-secret',
  GITHUB_REDIRECT_URI: 'http://localhost:3000/user/oauth/github/callback',

  OIDC_SCOPES: 'openid profile email',
  OIDC_REDIRECT_URI: 'http://localhost:3000/user/oauth/oidc/callback',

  AUTH_ENFORCE_TRUSTED_ORIGIN: 'true',

  // 显式置空：即使开发机 .env 里配了预置账号，测试进程也不会去创建它们
  BOOTSTRAP_ON_START: 'false',
  BOOTSTRAP_ENFORCE_ROLE: 'false',
  BOOTSTRAP_ADMIN_EMAIL: '',
  BOOTSTRAP_ADMIN_PASSWORD: '',
  BOOTSTRAP_SUPERVISOR_1_EMAIL: '',
  BOOTSTRAP_SUPERVISOR_1_PASSWORD: '',
  BOOTSTRAP_SUPERVISOR_2_EMAIL: '',
  BOOTSTRAP_SUPERVISOR_2_PASSWORD: '',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}
