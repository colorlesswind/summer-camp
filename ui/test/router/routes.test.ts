// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { RouteRecordRaw } from 'vue-router';
import { routes } from '@/router/routes';
import { useAuthStore } from '@/stores/auth';
import { makeUser } from '../helpers/fixtures';

interface FlatRoute {
  name: string;
  path: string;
  meta: Record<string, unknown>;
  parent: RouteRecordRaw | null;
}

function joinPath(parentPath: string, path: string): string {
  if (path.startsWith('/')) return path;
  const joined = `${parentPath === '/' ? '' : parentPath}/${path}`;
  if (joined === '/') return '/';
  return joined.replace(/\/$/, '');
}

function flatten(
  records: readonly RouteRecordRaw[],
  basePath = '',
  parent: RouteRecordRaw | null = null,
): FlatRoute[] {
  return records.flatMap((record) => {
    const fullPath = joinPath(basePath, record.path);
    const self: FlatRoute[] = record.name
      ? [{ name: String(record.name), path: fullPath, meta: record.meta ?? {}, parent }]
      : [];
    return [...self, ...flatten(record.children ?? [], fullPath, record)];
  });
}

const flatRoutes = flatten(routes);
const byName = new Map(flatRoutes.map((route) => [route.name, route]));

describe('route table', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('has no duplicate route names', () => {
    const names = flatRoutes.map((route) => route.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it.each([
    ['login', '/login'],
    ['forbidden', '/403'],
    ['home', '/'],
    ['student-start', '/start'],
    ['student-applications', '/applications'],
    ['student-application-new', '/applications/new'],
    ['student-application-detail', '/applications/:id'],
    ['admin-applications', '/admin/applications'],
    ['admin-application-detail', '/admin/applications/:id'],
    ['supervisor-applications', '/supervisor/applications'],
    ['supervisor-application-detail', '/supervisor/applications/:id'],
    ['not-found', '/:pathMatch(.*)*'],
  ])('registers %s at %s', (name, path) => {
    expect(byName.get(name)?.path).toBe(path);
  });

  it('guards the whole main layout behind authentication', () => {
    const main = routes.find((route) => route.path === '/');

    expect(main?.meta).toMatchObject({ requiresAuth: true });
    expect(main?.children?.length).toBeGreaterThan(0);
  });

  it('marks only the login page as guest-only', () => {
    const guestOnly = flatRoutes.filter((route) => route.meta.guestOnly);

    expect(guestOnly.map((route) => route.name)).toEqual(['login']);
  });

  it('restricts student pages to the student role', () => {
    for (const name of [
      'student-start',
      'student-applications',
      'student-application-new',
      'student-application-detail',
    ]) {
      expect(byName.get(name)?.meta.roles).toEqual(['student']);
    }
  });

  it('restricts the admin and supervisor areas to their own role', () => {
    expect(byName.get('admin-applications')?.meta.roles).toEqual(['admin']);
    expect(byName.get('admin-application-detail')?.meta.roles).toEqual(['admin']);
    expect(byName.get('supervisor-applications')?.meta.roles).toEqual(['supervisor']);
    expect(byName.get('supervisor-application-detail')?.meta.roles).toEqual(['supervisor']);
  });

  it('removes the layout padding only on the full-bleed student pages', () => {
    const fullBleed = flatRoutes.filter((route) => route.meta.fullBleed);

    expect(fullBleed.map((route) => route.name).sort()).toEqual([
      'student-application-detail',
      'student-application-new',
      'student-applications',
    ]);
  });

  it('sets a browser title on every navigable page', () => {
    for (const name of [
      'login',
      'forbidden',
      'student-start',
      'student-applications',
      'student-application-new',
      'student-application-detail',
      'admin-applications',
      'admin-application-detail',
      'supervisor-applications',
      'supervisor-application-detail',
      'not-found',
    ]) {
      expect(typeof byName.get(name)?.meta.title).toBe('string');
    }
  });

  it('redirects the root path to the home page of the signed-in role', () => {
    const home = routes.find((route) => route.path === '/')?.children?.find(
      (route) => route.name === 'home',
    );
    const redirect = home?.redirect;

    expect(typeof redirect).toBe('function');

    const store = useAuthStore();
    store.status = 'authenticated';
    store.user = makeUser({ role: 'student' });
    expect((redirect as () => string)()).toBe('/start');

    store.user = makeUser({ role: 'supervisor' });
    expect((redirect as () => string)()).toBe('/supervisor/applications');

    store.user = makeUser({ role: 'admin' });
    expect((redirect as () => string)()).toBe('/admin/applications');
  });

  it('falls back to the login path from the root redirect when nobody is signed in', () => {
    const home = routes.find((route) => route.path === '/')?.children?.find(
      (route) => route.name === 'home',
    );

    expect((home?.redirect as () => string)()).toBe('/login');
  });

  it('catches unknown paths with the not-found page', () => {
    const fallback = routes.find((route) => route.path === '/:pathMatch(.*)*');

    expect(fallback?.children?.[0].name).toBe('not-found');
  });

  it('uses lazy-loaded components for every page', () => {
    for (const route of routes) {
      if (route.name && route.name !== 'home') {
        expect(typeof route.component === 'function' || typeof route.component === 'object').toBe(true);
      }
    }
  });
});
