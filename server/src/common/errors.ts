export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'temporarily_unavailable';

/**
 * 统一的业务异常。error-handler 会把它序列化成 RFC7807 problem+json。
 * `expose=false`（5xx）时对外只返回通用文案，细节写日志。
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'invalid_request', message, details);

export const unauthorized = (message = '未认证或凭证已失效'): AppError =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = '无权访问', details?: unknown): AppError =>
  new AppError(403, 'forbidden', message, details);

export const notFound = (message = '资源不存在'): AppError =>
  new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown): AppError =>
  new AppError(409, 'conflict', message, details);

export const tooManyRequests = (message: string, retryAfterSeconds: number): AppError =>
  new AppError(429, 'rate_limited', message, { retryAfterSeconds });

export const serviceUnavailable = (message = '服务暂不可用'): AppError =>
  new AppError(503, 'temporarily_unavailable', message);

export const internal = (message = '服务器内部错误'): AppError =>
  new AppError(500, 'internal_error', message);

/** 认证失败统一使用 invalid_grant，避免暴露「用户不存在 / 密码错 / 验证码错」的差异。 */
export const invalidGrant = (message = '登录凭证无效'): AppError =>
  new AppError(401, 'invalid_grant', message);
