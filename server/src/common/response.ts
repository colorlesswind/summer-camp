import type { Response } from 'express';

/**
 * 统一成功响应包装：{ code, message, data }
 *
 * 错误仍由 middleware/error-handler 输出 problem+json（含 code / detail），
 * 只是把「具体原因」提升到了顶层 code，见 error-handler 里的 reasonCode。
 * code 用 0 表示成功，客户端只需判断 `code === 0`。
 */
export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export const ok = <T>(res: Response, data: T, status = 200): void => {
  const body: ApiEnvelope<T> = { code: 0, message: 'ok', data };
  res.status(status).json(body);
};
