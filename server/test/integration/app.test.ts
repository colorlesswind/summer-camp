import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

vi.mock('@src/db/pool', () => ({
  pool: { execute: vi.fn() },
  withTransaction: vi.fn(),
  pingDatabase: vi.fn(),
  closePool: vi.fn(),
}));

import { createApp } from '@src/app';
import { pingDatabase } from '@src/db/pool';

const ping = vi.mocked(pingDatabase);

const APPLICATION_ID = '01J8Z6Q3W9K7X2C4V5B6N7M8P9';

let app: Express;

beforeEach(() => {
  vi.clearAllMocks();
  ping.mockResolvedValue(undefined);
  app = createApp();
});

describe('健康检查', () => {
  it('数据库可用 -> 200 status=ok', async () => {
    const response = await request(app).get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
    expect(typeof response.body.time).toBe('string');
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('数据库不可用 -> 503 status=degraded（供 LB / k8s 探针识别）', async () => {
    ping.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const response = await request(app).get('/healthz');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'degraded', database: 'unavailable' });
  });
});

describe('通用中间件', () => {
  it('隐藏 x-powered-by、带上 helmet 安全头', async () => {
    const response = await request(app).get('/healthz');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('未知路由 -> 404 problem+json', async () => {
    const response = await request(app).get('/nope');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toMatchObject({
      type: 'about:blank#not_found',
      title: 'not_found',
      status: 404,
      code: 'not_found',
    });
    expect(response.body.detail).toContain('GET /nope');
  });

  it('非法 JSON 请求体 -> 400 invalid_json', async () => {
    const response = await request(app)
      .post('/user/logon')
      .set('Content-Type', 'application/json')
      .send('{"email": bad}');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'invalid_json' });
  });

  it('CORS：允许的来源回显 ACAO 并允许 credentials，未允许的来源不给 ACAO', async () => {
    const allowed = await request(app)
      .options('/user/logon')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app)
      .options('/user/logon')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('写请求的 Origin 不在白名单 -> 403 origin_not_allowed（CSRF 第一道防线）', async () => {
    const response = await request(app)
      .post('/user/register')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.com', password: 'password1' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'origin_not_allowed' });
  });

  it('允许的 Origin 通过 Origin 校验后继续走参数校验', async () => {
    const response = await request(app)
      .post('/user/register')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'not-an-email', password: 'x' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'validation_failed' });
  });

  it('申请表单请求体放宽到 256kb：/form 之外仍然 32kb 限制', async () => {
    // 不是 413 即说明放宽后的解析器生效（这里预期 401，先被认证拦住）
    const response = await request(app)
      .post('/form/applications')
      .set('Content-Type', 'application/json')
      .send({ values: { note: 'x'.repeat(64 * 1024) } });

    expect(response.status).toBe(401);
  });
});

describe('鉴权边界', () => {
  it('未登录访问 /form/applications -> 401（不是 500 / 不是 404）', async () => {
    const response = await request(app).get('/form/applications');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ status: 401, message: '请先登录' });
  });

  it('未登录提交申请 -> 401，且在状态校验之前', async () => {
    const response = await request(app).post(`/form/applications/${APPLICATION_ID}/submit`);

    expect(response.status).toBe(401);
  });

  it('未登录登出 -> 401', async () => {
    const response = await request(app).post('/user/logout');

    expect(response.status).toBe(401);
  });

  it('GET /user/csrf 未登录也能拿到当前 CSRF token（用于刷新页面后重取）', async () => {
    const response = await request(app).get('/user/csrf').set('Cookie', 'sc_csrf=csrf-from-cookie');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ csrfToken: 'csrf-from-cookie' });
  });

  it('GET /user/csrf 没有 Cookie 时返回 null（前端据此判断需要重新登录）', async () => {
    const response = await request(app).get('/user/csrf');
    expect(response.body).toEqual({ csrfToken: null });
  });
});

describe('入参校验（在进入 service / 数据库之前拦截）', () => {
  it('注册缺少密码 -> 400 并列出字段错误', async () => {
    const response = await request(app).post('/user/register').send({ email: 'a@b.com' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('validation_failed');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'password' })]),
    );
  });

  it('注册带了 role 字段（提权尝试）-> 400 Unrecognized key', async () => {
    const response = await request(app)
      .post('/user/register')
      .send({ email: 'a@b.com', password: 'password1', role: 'admin' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body.errors)).toContain('Unrecognized key');
  });

  it('登录 grant_type 非法 -> 400', async () => {
    const response = await request(app)
      .post('/user/logon')
      .send({ grant_type: 'refresh', email: 'a@b.com' });

    expect(response.status).toBe(400);
  });

  it('邮箱验证码格式不对 -> 400', async () => {
    const response = await request(app)
      .post('/user/email/verify')
      .send({ email: 'a@b.com', code: 'abc' });

    expect(response.status).toBe(400);
  });

  it('申请 ID 不是 ULID -> 401 优先（没有登录态时先拦认证）', async () => {
    const response = await request(app).get('/form/applications/not-a-ulid');
    expect(response.status).toBe(401);
  });
});
