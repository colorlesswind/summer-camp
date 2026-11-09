import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { UserRole } from '@/types/user';

declare module 'vue-router' {
  interface RouteMeta {
    /** 需要登录 */
    requiresAuth?: boolean;
    /** 仅游客可见（登录页） */
    guestOnly?: boolean;
    /** 允许访问的角色；不填表示登录即可 */
    roles?: UserRole[];
    title?: string;
  }
}

const AuthLayout = () => import('@/layouts/AuthLayout.vue');
const MainLayout = () => import('@/layouts/MainLayout.vue');
const LoginView = () => import('@/features/auth/views/LoginView.vue');
const ForbiddenView = () => import('@/pages/ForbiddenView.vue');
const NotFoundView = () => import('@/pages/NotFoundView.vue');
const PlaceholderView = () => import('@/pages/PlaceholderView.vue');

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: AuthLayout,
    children: [
      {
        path: '',
        name: 'login',
        component: LoginView,
        meta: { guestOnly: true, title: 'Login' },
      },
    ],
  },
  {
    path: '/403',
    component: AuthLayout,
    children: [
      {
        path: '',
        name: 'forbidden',
        component: ForbiddenView,
        meta: { title: 'Forbidden' },
      },
    ],
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        // 登录后按角色分流；redirect 在守卫恢复会话之前求值，
        // 届时用户态可能还是空，登录页守卫会再次按角色跳转。
        path: '',
        name: 'home',
        redirect: () => useAuthStore().homePath,
      },
      {
        path: 'applications',
        name: 'student-applications',
        component: PlaceholderView,
        meta: { roles: ['student'], title: 'Application Status' },
      },
      {
        path: 'applications/:id',
        name: 'student-application-detail',
        component: PlaceholderView,
        meta: { roles: ['student'], title: 'Application Form' },
      },
      {
        path: 'admin/applications',
        name: 'admin-applications',
        component: PlaceholderView,
        meta: { roles: ['admin'], title: 'Applications' },
      },
      {
        path: 'admin/applications/:id',
        name: 'admin-application-detail',
        component: PlaceholderView,
        meta: { roles: ['admin'], title: 'Application Detail' },
      },
      {
        path: 'supervisor/applications',
        name: 'supervisor-applications',
        component: PlaceholderView,
        meta: { roles: ['supervisor'], title: 'Assigned Applications' },
      },
      {
        path: 'supervisor/applications/:id',
        name: 'supervisor-application-detail',
        component: PlaceholderView,
        meta: { roles: ['supervisor'], title: 'Application Detail' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    component: AuthLayout,
    children: [
      {
        path: '',
        name: 'not-found',
        component: NotFoundView,
        meta: { title: 'Page not found' },
      },
    ],
  },
];
