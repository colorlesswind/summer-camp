// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw,
  type Router,
} from 'vue-router';
import { routes } from '@/router/routes';
import { installGuards } from '@/router/guards';
import { useAuthStore } from '@/stores/auth';
import { makeUser } from '../helpers/fixtures';

const authApiMock = vi.hoisted(() => ({
  requestLogonOtp: vi.fn(),
  logon: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/api/auth', () => ({ authApi: authApiMock }));
vi.mock('@/utils/csrf', () => ({
  CSRF_COOKIE_NAME: 'sc_csrf',
  getCsrfToken: () => null,
  setCsrfFallbackToken: vi.fn(),
}));

const Page = defineComponent({ name: 'Page', render: () => h('div') });

/**
 * 用同步占位组件替换真实的懒加载页面：守卫只依赖 path/name/meta，
 * 这样可以避免为一次导航去 import ant-design-vue 的整棵依赖树。
 */
function stubComponents(records: readonly RouteRecordRaw[]): RouteRecordRaw[] {
  return records.map((record) => ({
    ...record,
    component: record.component ? Page : undefined,
    children: record.children ? stubComponents(record.children) : undefined,
  })) as RouteRecordRaw[];
}

function createTestRouter(): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...stubComponents(routes),
      {
        path: '/blank',
        name: 'blank',
        component: Page,
        meta: { requiresAuth: true },
      },
    ],
  });
  installGuards(router);
  return router;
}

function signIn(role: 'student' | 'admin' | 'supervisor'): void {
  const store = useAuthStore();
  store.status = 'authenticated';
  store.user = makeUser({ role, email: `${role}@example.com` });
}

describe('router guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    document.title = '';
  });

  it('sends an unauthenticated visitor to the login page with a redirect back', async () => {
    authApiMock.me.mockRejectedValue(new Error('401'));
    const router = createTestRouter();

    await router.push('/start');

    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query).toEqual({ redirect: '/start' });
  });

  it('does not add a redirect query when the visitor only asked for the root', async () => {
    authApiMock.me.mockRejectedValue(new Error('401'));
    const router = createTestRouter();

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query).toEqual({});
  });

  it('bootstraps the session once before the first guarded navigation', async () => {
    authApiMock.me.mockRejectedValue(new Error('401'));
    const router = createTestRouter();

    await router.push('/start');
    await router.push('/403');

    expect(authApiMock.me).toHaveBeenCalledTimes(1);
  });

  it('lets an unauthenticated visitor reach the public forbidden page', async () => {
    authApiMock.me.mockRejectedValue(new Error('401'));
    const router = createTestRouter();

    await router.push('/403');

    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('sends a signed-in student from the root to their home page', async () => {
    signIn('student');
    const router = createTestRouter();

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('student-start');
    expect(router.currentRoute.value.fullPath).toBe('/start');
  });

  it('keeps a signed-in user away from the login page', async () => {
    signIn('admin');
    const router = createTestRouter();

    await router.push('/login');

    expect(router.currentRoute.value.name).toBe('admin-applications');
    expect(authApiMock.me).not.toHaveBeenCalled();
  });

  it('blocks a student from the admin area', async () => {
    signIn('student');
    const router = createTestRouter();

    await router.push('/admin/applications');

    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('blocks an admin from the supervisor area', async () => {
    signIn('admin');
    const router = createTestRouter();

    await router.push('/supervisor/applications');

    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('allows the matching role into its own area', async () => {
    signIn('admin');
    const router = createTestRouter();

    await router.push('/admin/applications');

    expect(router.currentRoute.value.name).toBe('admin-applications');
  });

  it('allows a supervisor into the supervisor area', async () => {
    signIn('supervisor');
    const router = createTestRouter();

    await router.push('/supervisor/applications/42');

    expect(router.currentRoute.value.name).toBe('supervisor-application-detail');
    expect(router.currentRoute.value.params.id).toBe('42');
  });

  it('allows any signed-in role into a route without a role restriction', async () => {
    signIn('supervisor');
    const router = createTestRouter();

    await router.push('/blank');

    expect(router.currentRoute.value.name).toBe('blank');
  });

  it('redirects when a signed-in user only has an unknown role', async () => {
    // 服务端返回了无法识别的角色：视为无权限，而不是放行
    const store = useAuthStore();
    store.status = 'authenticated';
    store.user = { ...makeUser(), role: 'auditor' as never };
    const router = createTestRouter();

    await router.push('/admin/applications');

    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('updates document.title from the route meta', async () => {
    signIn('admin');
    const router = createTestRouter();

    await router.push('/admin/applications');
    expect(document.title).toBe('Applications | Summer Camp');

    await router.push('/admin/applications/42');
    expect(document.title).toBe('Application Detail | Summer Camp');
  });

  it('falls back to the product title when the route has no title', async () => {
    signIn('admin');
    const router = createTestRouter();

    await router.push('/blank');

    expect(document.title).toBe('Summer Camp | HKUST(GZ)');
  });
});
