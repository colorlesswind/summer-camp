// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosResponse } from 'axios';

vi.mock('@/api/http', () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  };
  return { http: instance };
});

import { http } from '@/api/http';
import { authApi } from '@/api/auth';
import { applicationApi } from '@/api/application';
import type { LogonResponse, MeResponse } from '@/types/user';
import type { ApplicationDetail, ApplicationListResult, BatchOfferResult, FormSchema } from '@/types/application';

const mocked = {
  get: vi.mocked(http.get),
  post: vi.mocked(http.post),
  put: vi.mocked(http.put),
};

/** 模拟服务端的 { code, message, data } 信封 */
function envelope<T>(data: T): AxiosResponse {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  };
}

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests a logon OTP with the logon purpose', async () => {
    mocked.post.mockResolvedValue({
      data: { accepted: true, expiresInSeconds: 600 },
    } as AxiosResponse);

    const result = await authApi.requestLogonOtp('alice@example.com');

    expect(mocked.post).toHaveBeenCalledWith('/user/otp', {
      email: 'alice@example.com',
      purpose: 'logon',
    });
    expect(result).toEqual({ accepted: true, expiresInSeconds: 600 });
  });

  it('posts the OTP grant unchanged', async () => {
    const response: LogonResponse = {
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'u1',
        email: 'alice@example.com',
        displayName: null,
        emailVerified: true,
        status: 'active',
        role: 'student',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      csrfToken: 'csrf-1',
    };
    mocked.post.mockResolvedValue({ data: response } as AxiosResponse);

    const request = { grant_type: 'otp', email: 'alice@example.com', otp: '123456' } as const;
    const result = await authApi.logon(request);

    expect(mocked.post).toHaveBeenCalledWith('/user/logon', request);
    expect(result.csrfToken).toBe('csrf-1');
  });

  it('marks the /user/me probe as skipSessionExpired', async () => {
    const me: MeResponse = {
      user: {
        id: 'u1',
        email: 'alice@example.com',
        displayName: null,
        emailVerified: true,
        status: 'active',
        role: 'admin',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      identities: [],
    };
    mocked.get.mockResolvedValue({ data: me } as AxiosResponse);

    await authApi.me();

    expect(mocked.get).toHaveBeenCalledWith('/user/me', { skipSessionExpired: true });
  });

  it('posts to the logout endpoint', async () => {
    mocked.post.mockResolvedValue({ data: null } as AxiosResponse);

    await authApi.logout();

    expect(mocked.post).toHaveBeenCalledWith('/user/logout');
  });
});

describe('applicationApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const detail = { id: 'app-1' } as ApplicationDetail;

  it('unwraps the envelope for the schema', async () => {
    const schema = { sections: [] } as unknown as FormSchema;
    mocked.get.mockResolvedValue({ ...envelope(schema) });

    await expect(applicationApi.schema()).resolves.toBe(schema);
    expect(mocked.get).toHaveBeenCalledWith('/form/schema');
  });

  it('returns null from "mine" when the server has no application yet', async () => {
    mocked.get.mockResolvedValue({ ...envelope(null) });

    await expect(applicationApi.mine()).resolves.toBeNull();
    expect(mocked.get).toHaveBeenCalledWith('/form/applications/mine');
  });

  it('builds the detail URL from the id', async () => {
    mocked.get.mockResolvedValue({ ...envelope(detail) });

    await expect(applicationApi.detail('app-1')).resolves.toBe(detail);
    expect(mocked.get).toHaveBeenCalledWith('/form/applications/app-1');
  });

  it('creates the first draft with the values payload', async () => {
    mocked.post.mockResolvedValue({ ...envelope(detail) });
    const values = { nameEn: 'Alice' };

    await applicationApi.create(values);

    expect(mocked.post).toHaveBeenCalledWith('/form/applications', { values });
  });

  it('saves an existing application with PUT', async () => {
    mocked.put.mockResolvedValue({ ...envelope(detail) });
    const values = { nameEn: 'Alice' };

    await applicationApi.save('app-1', values);

    expect(mocked.put).toHaveBeenCalledWith('/form/applications/app-1', { values });
  });

  it.each([
    ['submit', '/form/applications/app-1/submit'],
    ['resubmit', '/form/applications/app-1/resubmit'],
    ['acceptOffer', '/form/applications/app-1/accept-offer'],
    ['declineOffer', '/form/applications/app-1/decline-offer'],
    ['approve', '/form/applications/app-1/approve'],
    ['sendOffer', '/form/applications/app-1/send-offer'],
  ] as const)('%s posts to %s', async (method, url) => {
    mocked.post.mockResolvedValue({ ...envelope(detail) });

    await applicationApi[method]('app-1');

    expect(mocked.post).toHaveBeenCalledWith(url);
  });

  it('sends the return reason as JSON', async () => {
    mocked.post.mockResolvedValue({ ...envelope(detail) });

    await applicationApi.returnToStudent('app-1', 'Please fix the name');

    expect(mocked.post).toHaveBeenCalledWith('/form/applications/app-1/return', {
      reason: 'Please fix the name',
    });
  });

  it('sends the batch offer ids with the extended timeout', async () => {
    const result: BatchOfferResult = { total: 2, successCount: 2, failureCount: 0, failures: [] };
    mocked.post.mockResolvedValue({ ...envelope(result) });

    await expect(applicationApi.sendOfferBatch(['a', 'b'])).resolves.toEqual(result);

    expect(mocked.post).toHaveBeenCalledWith(
      '/form/offers/batch',
      { ids: ['a', 'b'] },
      { timeout: 60_000 },
    );
  });

  it('trims the optional review reason and omits a blank one', async () => {
    mocked.post.mockResolvedValue({ ...envelope(detail) });

    await applicationApi.recommend('app-1', '  strong candidate  ');
    await applicationApi.reject('app-1', '   ');

    expect(mocked.post).toHaveBeenNthCalledWith(1, '/form/applications/app-1/recommend', {
      reason: 'strong candidate',
    });
    expect(mocked.post).toHaveBeenNthCalledWith(2, '/form/applications/app-1/reject', {
      reason: undefined,
    });
  });

  it('lists my applications with pagination params', async () => {
    const page: ApplicationListResult = { items: [], total: 0, page: 2, pageSize: 50 };
    mocked.get.mockResolvedValue({ ...envelope(page) });

    await expect(applicationApi.listMine(2, 50)).resolves.toEqual(page);

    expect(mocked.get).toHaveBeenCalledWith('/form/applications', {
      params: { page: 2, pageSize: 50 },
    });
  });

  it('passes the admin list filters through as query params', async () => {
    const page: ApplicationListResult = { items: [], total: 0, page: 1, pageSize: 20 };
    mocked.get.mockResolvedValue({ ...envelope(page) });

    await applicationApi.list({
      status: 'Returned',
      keyword: 'alice',
      page: 1,
      pageSize: 20,
    });

    expect(mocked.get).toHaveBeenCalledWith('/form/applications', {
      params: { status: 'Returned', keyword: 'alice', page: 1, pageSize: 20 },
    });
  });

  it('searches supervisors by program and trims the keyword', async () => {
    const items = [{ id: 1, name: 'Prof. One' }];
    mocked.get.mockResolvedValue({ ...envelope({ items }) });

    await expect(applicationApi.searchSupervisors('P1', '  Prof  ', 10)).resolves.toEqual(items);

    expect(mocked.get).toHaveBeenCalledWith('/form/supervisors', {
      params: { programCode: 'P1', keyword: 'Prof', limit: 10 },
    });
  });

  it('omits a blank supervisor keyword and defaults the limit to 50', async () => {
    mocked.get.mockResolvedValue({ ...envelope({ items: [] }) });

    await applicationApi.searchSupervisors('P2', '   ');

    expect(mocked.get).toHaveBeenCalledWith('/form/supervisors', {
      params: { programCode: 'P2', keyword: undefined, limit: 50 },
    });
  });
});
