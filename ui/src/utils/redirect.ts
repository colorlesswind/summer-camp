/**
 * 登录后跳转地址校验：只允许站内绝对路径，且不允许回到登录页，
 * 避免 ?redirect=//evil.com 这类开放重定向。
 */
export function resolveRedirect(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/login/')) return fallback;

  return raw;
}
