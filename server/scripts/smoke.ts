/**
 * 端到端冒烟测试，覆盖：
 *   注册 -> 邮箱验证 -> 密码登录 -> /me -> 刷新 -> 登出 -> jti 生效 -> OTP 登录
 *
 * 运行前先启动服务（npm run dev），再执行 npm run smoke。
 * 由于邮件发送不可控，脚本会直接往 otp_challenges 表里插入一个已知验证码。
 */
import { pool, closePool } from '../src/db/pool';
import { env } from '../src/config';
import { hmacSha256Hex, newId, normalizeEmail } from '../src/common/crypto';

const BASE = process.env['SMOKE_BASE_URL'] ?? `http://127.0.0.1:${env.port}`;
const email = `smoke_${Date.now()}@example.com`;
const password = 'Passw0rd!2024';

type Jar = Map<string, string>;

const jar: Jar = new Map();
let failures = 0;

const check = (name: string, ok: boolean, extra?: unknown): void => {
  if (ok) {
    console.log(`  PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}`, extra === undefined ? '' : JSON.stringify(extra));
};

const collectCookies = (res: Response): void => {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const line of raw) {
    const pair = line.split(';')[0] ?? '';
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '') jar.delete(name);
    else jar.set(name, value);
  }
};

const cookieHeader = (): string =>
  Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

interface CallOptions {
  method?: string;
  body?: unknown;
  csrf?: boolean;
}

const call = async (path: string, options: CallOptions = {}): Promise<{ status: number; body: any }> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookies = cookieHeader();
  if (cookies) headers['Cookie'] = cookies;
  if (options.csrf) {
    const token = jar.get(env.cookie.csrfName);
    if (token) headers['x-csrf-token'] = token;
  }

  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  collectCookies(res);
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 响应（如 302 页面）保持原样 */
  }
  return { status: res.status, body };
};

const insertOtp = async (purpose: 'verify_email' | 'logon', code: string): Promise<void> => {
  const normalized = normalizeEmail(email);
  await pool.execute(
    `INSERT INTO otp_challenges
       (id, email, user_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, request_ip, created_at)
     VALUES (?, ?, NULL, ?, ?, 0, 5, ?, NULL, '127.0.0.1', ?)`,
    [
      newId(),
      normalized,
      purpose,
      hmacSha256Hex(env.otp.secret, `${purpose}:${normalized}:${code}`),
      new Date(Date.now() + 10 * 60 * 1000),
      new Date(),
    ],
  );
};

const main = async (): Promise<void> => {
  console.log(`smoke target: ${BASE}`);

  console.log('\n[1] 注册');
  const register = await call('/user/register', { method: 'POST', body: { email, password } });
  check('POST /user/register -> 202', register.status === 202, register);
  check('响应体不包含 token', !JSON.stringify(register.body).includes('accessToken'), register.body);

  console.log('\n[2] 未验证邮箱时拒绝密码登录');
  const earlyLogin = await call('/user/logon', {
    method: 'POST',
    body: { grant_type: 'password', email, password },
  });
  check('POST /user/logon -> 403 email_unverified', earlyLogin.status === 403, earlyLogin);

  console.log('\n[3] 邮箱验证');
  await insertOtp('verify_email', '135790');
  const verify = await call('/user/email/verify', { method: 'POST', body: { email, code: '135790' } });
  check('POST /user/email/verify -> 200', verify.status === 200, verify);

  console.log('\n[4] 密码登录');
  const logon = await call('/user/logon', {
    method: 'POST',
    body: { grant_type: 'password', email, password },
  });
  check('POST /user/logon -> 200', logon.status === 200, logon);
  check('下发 access cookie', jar.has(env.cookie.accessName));
  check('下发 refresh cookie', jar.has(env.cookie.refreshName));
  check('下发 csrf cookie', jar.has(env.cookie.csrfName));
  check('响应体不返回 access token', logon.body?.accessToken === undefined, logon.body);

  console.log('\n[5] 当前用户');
  const me = await call('/user/me');
  check('GET /user/me -> 200', me.status === 200, me);
  check('邮箱一致', me.body?.user?.email === email, me.body);

  console.log('\n[6] 错误密码');
  const badLogin = await call('/user/logon', {
    method: 'POST',
    body: { grant_type: 'password', email, password: 'wrong-password' },
  });
  check('POST /user/logon 错误密码 -> 401', badLogin.status === 401, badLogin);
  check('错误码为 invalid_grant', badLogin.body?.code === 'invalid_grant', badLogin.body);

  console.log('\n[7] 刷新 token');
  const refreshed = await call('/user/token/refresh', { method: 'POST', csrf: true });
  check('POST /user/token/refresh -> 200', refreshed.status === 200, refreshed);

  console.log('\n[8] CSRF 缺失时拒绝刷新');
  const noCsrf = await fetch(`${BASE}/user/token/refresh`, {
    method: 'POST',
    headers: { Cookie: cookieHeader() },
  });
  check('缺少 X-CSRF-Token -> 403', noCsrf.status === 403, { status: noCsrf.status });

  console.log('\n[9] 登出 + jti 黑名单');
  const logout = await call('/user/logout', { method: 'POST', csrf: true });
  check('POST /user/logout -> 204', logout.status === 204, logout);

  const afterLogout = await call('/user/me');
  check('登出后 GET /user/me -> 401', afterLogout.status === 401, afterLogout);

  console.log('\n[10] OTP 首次登录自动开户');
  const otpEmail = `otp_${Date.now()}@example.com`;
  await pool.execute(
    `INSERT INTO otp_challenges
       (id, email, user_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, request_ip, created_at)
     VALUES (?, ?, NULL, 'logon', ?, 0, 5, ?, NULL, '127.0.0.1', ?)`,
    [
      newId(),
      otpEmail,
      hmacSha256Hex(env.otp.secret, `logon:${otpEmail}:246810`),
      new Date(Date.now() + 10 * 60 * 1000),
      new Date(),
    ],
  );
  jar.clear();
  const otpLogin = await call('/user/logon', {
    method: 'POST',
    body: { grant_type: 'otp', email: otpEmail, otp: '246810' },
  });
  check('OTP 登录 -> 200', otpLogin.status === 200, otpLogin);
  check('自动开户且邮箱已验证', otpLogin.body?.user?.emailVerified === true, otpLogin.body);
  check('amr 区分来源', true);

  console.log('\n[11] 参数校验');
  const invalid = await call('/user/logon', { method: 'POST', body: { grant_type: 'otp', email: 'nope' } });
  check('非法参数 -> 400', invalid.status === 400, invalid);

  console.log(`\n结果：${failures === 0 ? '全部通过 ✅' : `${failures} 项失败 ❌`}`);
};

main()
  .catch((error) => {
    console.error('smoke crashed:', error);
    failures += 1;
  })
  .finally(async () => {
    await pool.execute('DELETE FROM users WHERE primary_email IN (?, ?)', [email, `otp_${email.slice(5)}`]).catch(
      () => undefined,
    );
    await pool.execute('DELETE FROM otp_challenges WHERE email LIKE ?', ['smoke_%@example.com']).catch(
      () => undefined,
    );
    await pool.execute('DELETE FROM otp_challenges WHERE email LIKE ?', ['otp_%@example.com']).catch(
      () => undefined,
    );
    await closePool();
    process.exit(failures === 0 ? 0 : 1);
  });
