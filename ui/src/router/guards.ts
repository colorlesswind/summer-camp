import type { Router } from 'vue-router';
import { APP_NAME } from '@/constants/app';
import { useAuthStore } from '@/stores/auth';

const DEFAULT_TITLE = `${APP_NAME} | HKUST(GZ)`;

export function installGuards(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore();

    // 首次进入时恢复会话：/user/me（access token 过期会自动刷新并重试）
    await auth.bootstrap();

    if (to.meta.guestOnly && auth.isAuthenticated) {
      return auth.homePath;
    }

    if (to.meta.requiresAuth) {
      if (!auth.isAuthenticated) {
        return {
          name: 'login',
          query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
        };
      }

      const roles = to.meta.roles;
      if (roles && (!auth.role || !roles.includes(auth.role))) {
        return { name: 'forbidden' };
      }
    }

    return true;
  });

  router.afterEach((to) => {
    const title = typeof to.meta.title === 'string' ? to.meta.title : '';
    document.title = title ? `${title} | Summer Camp` : DEFAULT_TITLE;
  });
}
