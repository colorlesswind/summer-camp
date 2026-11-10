import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getCsrfToken } from '@/utils/csrf';
import { toApiError } from './problem';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 401 且刷新失败时，不触发全局「会话失效」跳转（用于启动时的 /user/me 探测） */
    skipSessionExpired?: boolean;
    /** 内部标记：该请求已经重放过一次，避免无限循环 */
    _retried?: boolean;
  }
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/',
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

/* -------------------------------------------------------------------------- */
/* CSRF：非 GET 请求自动带上双提交 token                                        */
/* -------------------------------------------------------------------------- */

http.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (!['get', 'head', 'options'].includes(method)) {
    const token = getCsrfToken();
    if (token) config.headers.set('X-CSRF-Token', token);
  }
  return config;
});

/* -------------------------------------------------------------------------- */
/* 会话失效回调：由 main.ts 注入，避免 http 层反向依赖 store / router             */
/* -------------------------------------------------------------------------- */

let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

const notifySessionExpired = (): void => {
  sessionExpiredHandler?.();
};

/* -------------------------------------------------------------------------- */
/* 401：单飞刷新 + 重放一次                                                     */
/* -------------------------------------------------------------------------- */

const AUTH_ENDPOINTS = [
  '/user/logon',
  '/user/otp',
  '/user/register',
  '/user/email/verify',
  '/user/token/refresh',
];

const isAuthEndpoint = (url: string): boolean => AUTH_ENDPOINTS.some((path) => url.includes(path));

let refreshPromise: Promise<void> | null = null;

const refreshAccessToken = (): Promise<void> => {
  if (!refreshPromise) {
    refreshPromise = http
      .post('/user/token/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? '';

    if (status === 401 && config && !isAuthEndpoint(url)) {
      // 没有可读的 CSRF Cookie 说明本来就没有会话，不必再打一次刷新接口
      if (!config._retried && getCsrfToken() !== null) {
        config._retried = true;
        try {
          await refreshAccessToken();
          // 重放时请求拦截器会重新读取刷新后下发的 sc_csrf
          return await http(config);
        } catch (refreshError) {
          const problem = toApiError(refreshError);
          const sessionDead = problem.status === 401 || problem.code === 'csrf_token_invalid';
          if (sessionDead && !config.skipSessionExpired) notifySessionExpired();
          throw problem;
        }
      }

      if (!config.skipSessionExpired) notifySessionExpired();
    }

    throw toApiError(error);
  },
);

export { ApiError } from './problem';
