// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

const csrfState = vi.hoisted(() => ({ token: null as string | null }));

vi.mock('@/utils/csrf', () => ({
  CSRF_COOKIE_NAME: 'sc_csrf',
  getCsrfToken: () => csrfState.token,
  setCsrfFallbackToken: (value: string | null) => {
    csrfState.token = value;
  },
}));

import { http, setSessionExpiredHandler } from '@/api/http';
import { ApiError } from '@/api/problem';

interface RecordedCall {
  method: string;
  url: string;
  csrf: string | null;
  data: unknown;
}

interface AdapterReply {
  status: number;
  data?: unknown;
}

type Handler = (config: InternalAxiosRequestConfig, call: RecordedCall) => AdapterReply;

let calls: RecordedCall[] = [];

function installAdapter(handler: Handler): void {
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const headers = config.headers as AxiosHeaders;
    const call: RecordedCall = {
      method: (config.method ?? 'GET').toUpperCase(),
      url: config.url ?? '',
      csrf: (headers.get('X-CSRF-Token') as string | undefined) ?? null,
      data: config.data,
    };
    calls.push(call);

    const reply = handler(config, call);
    if (reply.status >= 200 && reply.status < 300) {
      return {
        data: reply.data,
        status: reply.status,
        statusText: 'OK',
        headers: {},
        config,
      } satisfies AxiosResponse;
    }

    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, {
      data: reply.data,
      status: reply.status,
      statusText: '',
      headers: {},
      config,
    } satisfies AxiosResponse);
  }) as AxiosAdapter;
}

const callUrls = (): string[] => calls.map((call) => call.url);

describe('http request interceptor (CSRF double submit)', () => {
  beforeEach(() => {
    calls = [];
    csrfState.token = null;
    setSessionExpiredHandler(null);
  });

  it('attaches the CSRF header to state-changing requests', async () => {
    csrfState.token = 'token-abc';
    installAdapter(() => ({ status: 200, data: { ok: true } }));

    await http.post('/form/applications', { values: {} });

    expect(calls[0].csrf).toBe('token-abc');
  });

  it('does not attach the CSRF header to GET requests', async () => {
    csrfState.token = 'token-abc';
    installAdapter(() => ({ status: 200, data: {} }));

    await http.get('/user/me');

    expect(calls[0].csrf).toBeNull();
  });

  it.each(['head', 'options'] as const)('does not attach the CSRF header to %s', async (method) => {
    csrfState.token = 'token-abc';
    installAdapter(() => ({ status: 200, data: {} }));

    await http.request({ method, url: '/healthz' });

    expect(calls[0].csrf).toBeNull();
  });

  it('omits the header when no token is readable', async () => {
    installAdapter(() => ({ status: 200, data: {} }));

    await http.post('/user/logout');

    expect(calls[0].csrf).toBeNull();
  });
});

describe('http response interceptor (401 refresh + replay)', () => {
  beforeEach(() => {
    calls = [];
    csrfState.token = 'token-abc';
    setSessionExpiredHandler(null);
  });

  it('refreshes once and replays the original request', async () => {
    let formAttempts = 0;
    installAdapter((_config, call) => {
      if (call.url === '/user/token/refresh') return { status: 204 };
      formAttempts += 1;
      return formAttempts === 1 ? { status: 401, data: { code: 'unauthorized' } } : { status: 200, data: { value: 42 } };
    });

    const response = await http.get<{ value: number }>('/form/applications/app-1');

    expect(response.data).toEqual({ value: 42 });
    expect(callUrls()).toEqual([
      '/form/applications/app-1',
      '/user/token/refresh',
      '/form/applications/app-1',
    ]);
    // 刷新请求本身也要带 CSRF
    expect(calls[1].csrf).toBe('token-abc');
  });

  it('shares a single refresh request across concurrent 401s', async () => {
    let releaseRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    let formAttempts = 0;
    installAdapter((_config, call) => {
      if (call.url === '/user/token/refresh') return { status: 204 };
      formAttempts += 1;
      return formAttempts <= 2
        ? { status: 401, data: { code: 'unauthorized' } }
        : { status: 200, data: { ok: true } };
    });

    // 用 gate 拖住刷新请求，确保两个 401 都进入「等待刷新」状态
    const adapter = http.defaults.adapter as AxiosAdapter;
    http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/user/token/refresh') await refreshGate;
      return adapter(config);
    }) as AxiosAdapter;

    const both = Promise.all([http.get('/form/a'), http.get('/form/b')]);
    await vi.waitFor(() => {
      expect(formAttempts).toBe(2);
    });
    releaseRefresh?.();
    const responses = await both;

    expect(responses.map((response) => response.data)).toEqual([{ ok: true }, { ok: true }]);
    expect(callUrls().filter((url) => url === '/user/token/refresh')).toHaveLength(1);
  });

  it('notifies the session-expired handler when there is no CSRF token to refresh with', async () => {
    csrfState.token = null;
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    installAdapter(() => ({ status: 401, data: { code: 'unauthorized' } }));

    await expect(http.get('/form/applications')).rejects.toBeInstanceOf(ApiError);

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(callUrls()).toEqual(['/form/applications']);
  });

  it('does not try to refresh an auth endpoint', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    installAdapter(() => ({ status: 401, data: { code: 'invalid_grant' } }));

    await expect(http.post('/user/logon', { grant_type: 'password' })).rejects.toMatchObject({
      code: 'invalid_grant',
      status: 401,
    });

    expect(callUrls()).toEqual(['/user/logon']);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('respects skipSessionExpired and does not kick the user out on the /user/me probe', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    installAdapter((_config, call) =>
      call.url === '/user/token/refresh'
        ? { status: 401, data: { code: 'unauthorized' } }
        : { status: 401, data: { code: 'unauthorized' } },
    );

    await expect(
      http.get('/user/me', { skipSessionExpired: true }),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    expect(callUrls()).toEqual(['/user/me', '/user/token/refresh']);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('notifies the handler when the refresh itself fails on a normal request', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    installAdapter((_config, call) =>
      call.url === '/user/token/refresh'
        ? { status: 401, data: { code: 'csrf_token_invalid' } }
        : { status: 401, data: { code: 'unauthorized' } },
    );

    await expect(http.get('/form/applications')).rejects.toMatchObject({
      code: 'csrf_token_invalid',
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('replays at most once when the refreshed token is still rejected', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    installAdapter((_config, call) =>
      call.url === '/user/token/refresh'
        ? { status: 204 }
        : { status: 401, data: { code: 'unauthorized' } },
    );

    await expect(http.get('/form/applications')).rejects.toMatchObject({ code: 'unauthorized' });

    expect(callUrls()).toEqual([
      '/form/applications',
      '/user/token/refresh',
      '/form/applications',
    ]);
    // 内层重放失败会通知一次，外层 catch 再通知一次（handler 本身幂等）
    expect(onExpired).toHaveBeenCalledTimes(2);
  });

  it('normalises other failures to ApiError without touching the session', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    installAdapter(() => ({ status: 404, data: { code: 'not_found' } }));

    await expect(http.get('/form/applications/missing')).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
      message: 'The requested resource was not found.',
    });

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('can detach the session-expired handler', async () => {
    csrfState.token = null;
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    setSessionExpiredHandler(null);
    installAdapter(() => ({ status: 401, data: { code: 'unauthorized' } }));

    await expect(http.get('/form/applications')).rejects.toBeInstanceOf(ApiError);

    expect(onExpired).not.toHaveBeenCalled();
  });
});
