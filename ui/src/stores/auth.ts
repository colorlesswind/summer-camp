import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { authApi } from '@/api/auth';
import { LOGIN_PATH } from '@/constants/app';
import { ROLE_HOME } from '@/constants/roles';
import { setCsrfFallbackToken } from '@/utils/csrf';
import type { LogonResponse, UserProfile } from '@/types/user';

type AuthStatus = 'unknown' | 'loading' | 'authenticated' | 'guest';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserProfile | null>(null);
  const status = ref<AuthStatus>('unknown');

  const isAuthenticated = computed(() => status.value === 'authenticated' && user.value !== null);
  const role = computed(() => user.value?.role ?? null);
  const homePath = computed(() => (user.value ? ROLE_HOME[user.value.role] : LOGIN_PATH));

  const applySession = (response: LogonResponse): UserProfile => {
    // token 本体在 HttpOnly Cookie 里；这里只保留兜底 CSRF 与用户信息
    setCsrfFallbackToken(response.csrfToken);
    user.value = response.user;
    status.value = 'authenticated';
    return response.user;
  };

  const loginWithOtp = async (email: string, otp: string): Promise<UserProfile> => {
    const response = await authApi.logon({ grant_type: 'otp', email, otp });
    return applySession(response);
  };

  const loginWithPassword = async (email: string, password: string): Promise<UserProfile> => {
    const response = await authApi.logon({ grant_type: 'password', email, password });
    return applySession(response);
  };

  const reset = (): void => {
    setCsrfFallbackToken(null);
    user.value = null;
    status.value = 'guest';
  };

  let bootstrapPromise: Promise<void> | null = null;

  /**
   * 应用启动时恢复会话：GET /user/me（access token 过期时 http 层会自动刷新并重试）。
   * 只执行一次，失败即视为游客。
   */
  const bootstrap = async (): Promise<void> => {
    if (status.value === 'authenticated' || status.value === 'guest') return;

    if (!bootstrapPromise) {
      status.value = 'loading';
      bootstrapPromise = authApi
        .me()
        .then((response) => {
          user.value = response.user;
          status.value = 'authenticated';
        })
        .catch(() => {
          user.value = null;
          status.value = 'guest';
        })
        .finally(() => {
          bootstrapPromise = null;
        });
    }

    await bootstrapPromise;
  };

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } finally {
      reset();
    }
  };

  return {
    user,
    status,
    isAuthenticated,
    role,
    homePath,
    loginWithOtp,
    loginWithPassword,
    logout,
    reset,
    bootstrap,
  };
});
