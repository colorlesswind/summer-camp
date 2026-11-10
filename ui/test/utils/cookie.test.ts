// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCookie } from '@/utils/cookie';
import { CSRF_COOKIE_NAME, getCsrfToken, setCsrfFallbackToken } from '@/utils/csrf';

/** 清空 jsdom 的 cookie（document.cookie 只能逐个过期） */
function clearCookies(): void {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

describe('readCookie', () => {
  afterEach(() => {
    clearCookies();
  });

  it('returns null when the cookie does not exist', () => {
    expect(readCookie('sc_csrf')).toBeNull();
  });

  it('reads the value of a single cookie', () => {
    document.cookie = 'sc_csrf=token-123';
    expect(readCookie('sc_csrf')).toBe('token-123');
  });

  it('finds the cookie among several and trims the surrounding spaces', () => {
    document.cookie = 'first=1';
    document.cookie = 'sc_csrf=token-456';
    document.cookie = 'last=2';

    expect(readCookie('sc_csrf')).toBe('token-456');
  });

  it('decodes URI-encoded names and values', () => {
    document.cookie = `${encodeURIComponent('sc csrf')}=${encodeURIComponent('a b&c')}`;

    expect(readCookie('sc csrf')).toBe('a b&c');
  });

  it('does not match a cookie whose name merely ends with the requested name', () => {
    document.cookie = 'my_sc_csrf=wrong';
    document.cookie = 'sc_csrf=right';

    expect(readCookie('sc_csrf')).toBe('right');
  });

  it('reads the latest value when the same cookie is overwritten', () => {
    document.cookie = 'sc_csrf=first';
    document.cookie = 'sc_csrf=second';

    expect(readCookie('sc_csrf')).toBe('second');
  });
});

describe('csrf token', () => {
  beforeEach(() => {
    clearCookies();
    setCsrfFallbackToken(null);
  });

  afterEach(() => {
    clearCookies();
    setCsrfFallbackToken(null);
  });

  it('uses the documented cookie name', () => {
    expect(CSRF_COOKIE_NAME).toBe('sc_csrf');
  });

  it('returns null when neither cookie nor fallback is available', () => {
    expect(getCsrfToken()).toBeNull();
  });

  it('prefers the readable cookie over the fallback token', () => {
    document.cookie = 'sc_csrf=from-cookie';
    setCsrfFallbackToken('from-body');

    expect(getCsrfToken()).toBe('from-cookie');
  });

  it('falls back to the token from the logon response when the cookie is unreadable', () => {
    setCsrfFallbackToken('from-body');

    expect(getCsrfToken()).toBe('from-body');
  });

  it('clears the fallback token when set to null', () => {
    setCsrfFallbackToken('from-body');
    setCsrfFallbackToken(null);

    expect(getCsrfToken()).toBeNull();
  });
});
