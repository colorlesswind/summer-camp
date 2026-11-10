import { describe, expect, it } from 'vitest';
import { resolveRedirect } from '@/utils/redirect';

const FALLBACK = '/start';

describe('resolveRedirect', () => {
  it('keeps a site-relative path', () => {
    expect(resolveRedirect('/admin/applications?page=2', FALLBACK)).toBe(
      '/admin/applications?page=2',
    );
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an empty string', ''],
    ['an absolute URL', 'https://evil.example/start'],
    ['a protocol-relative URL', '//evil.example/start'],
    ['a backslash trick', '\\\\evil.example'],
    ['a relative path', 'admin/applications'],
    ['a relative path with dot-dot', '../admin'],
  ])('falls back for %s', (_label, raw) => {
    expect(resolveRedirect(raw, FALLBACK)).toBe(FALLBACK);
  });

  it.each(['/login', '/login?redirect=/start', '/login/', '/login/otp'])(
    'never redirects back to the login page (%s)',
    (raw) => {
      expect(resolveRedirect(raw, FALLBACK)).toBe(FALLBACK);
    },
  );

  it('allows a path that merely starts with "login"', () => {
    expect(resolveRedirect('/login-help', FALLBACK)).toBe('/login-help');
  });
});
