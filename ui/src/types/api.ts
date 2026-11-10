/** 服务端 zod 校验失败时返回的字段级错误 */
export interface FieldIssue {
  path: string;
  code: string;
  message: string;
}

/** RFC 7807 problem+json（服务端 error-handler 的输出） */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  message?: string;
  detail?: string;
  errors?: FieldIssue[];
}
