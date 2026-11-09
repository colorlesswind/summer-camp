import axios from 'axios';
import type { FieldIssue, ProblemDetail } from '@/types/api';

/** 服务端错误文案是中文，UI 统一展示英文；按 code 映射，未知码走兜底 */
const MESSAGES: Record<string, string> = {
  validation_failed: 'Please check the information you entered.',
  invalid_request: 'The request is invalid. Please check the information and try again.',
  invalid_grant: 'The sign-in details are incorrect.',
  unauthorized: 'Your session has expired. Please sign in again.',
  email_unverified: 'Please verify your email address before signing in.',
  csrf_token_invalid: 'Your session has expired. Please refresh the page and try again.',
  origin_not_allowed: 'The request origin is not allowed.',
  forbidden: 'You do not have permission to perform this action.',
  not_found: 'The requested resource was not found.',
  conflict: 'This action conflicts with the current state.',
  invalid_transition: 'This action is not allowed in the current status.',
  submission_window_closed: 'The submission window is closed.',
  application_exists: 'An application already exists for this account.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  internal_error: 'Something went wrong on the server. Please try again later.',
  temporarily_unavailable: 'The service is temporarily unavailable. Please try again later.',
  network_error: 'Unable to reach the server. Please check your connection and try again.',
  request_failed: 'The request could not be completed. Please try again.',
};

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/** 统一的 API 错误：code 来自服务端 problem+json，message 已翻译成英文 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldIssues: FieldIssue[];

  constructor(code: string, status: number, message: string, fieldIssues: FieldIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldIssues = fieldIssues;
  }
}

const isFieldIssue = (value: unknown): value is FieldIssue => {
  if (typeof value !== 'object' || value === null) return false;
  const issue = value as Partial<FieldIssue>;
  return typeof issue.path === 'string' && typeof issue.message === 'string';
};

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const data = error.response?.data as ProblemDetail | undefined;
    const code =
      typeof data?.code === 'string' && data.code.length > 0
        ? data.code
        : status === 0
          ? 'network_error'
          : 'request_failed';
    const fieldIssues = Array.isArray(data?.errors) ? data.errors.filter(isFieldIssue) : [];

    return new ApiError(code, status, MESSAGES[code] ?? FALLBACK_MESSAGE, fieldIssues);
  }

  return new ApiError('unknown_error', 0, FALLBACK_MESSAGE);
}
