// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { ApiError, toApiError } from '@/api/problem';
import type { ProblemDetail } from '@/types/api';

function makeAxiosError(status: number | null, data?: ProblemDetail): AxiosError {
  const config = { headers: {} } as never;
  if (status === null) {
    return new AxiosError('Network Error', 'ERR_NETWORK', config);
  }
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('ApiError', () => {
  it('exposes code, status, message and field issues', () => {
    const error = new ApiError('not_found', 404, 'Missing', [
      { path: 'values.x', code: 'required', message: 'x is required' },
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.code).toBe('not_found');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Missing');
    expect(error.fieldIssues).toHaveLength(1);
  });

  it('defaults fieldIssues to an empty array', () => {
    expect(new ApiError('x', 0, 'm').fieldIssues).toEqual([]);
  });
});

describe('toApiError', () => {
  it('returns the same instance for an ApiError', () => {
    const original = new ApiError('invalid_transition', 409, 'Nope');

    expect(toApiError(original)).toBe(original);
  });

  it('maps the problem+json code to an English message', () => {
    const error = toApiError(
      makeAxiosError(409, { code: 'invalid_transition', message: '服务端中文文案' }),
    );

    expect(error.code).toBe('invalid_transition');
    expect(error.status).toBe(409);
    expect(error.message).toBe('This action is not allowed in the current status.');
  });

  it('falls back to a generic message for an unknown problem code', () => {
    const error = toApiError(makeAxiosError(400, { code: 'brand_new_code' }));

    expect(error.code).toBe('brand_new_code');
    expect(error.message).toBe('Something went wrong. Please try again.');
  });

  it('uses request_failed when the response has no code', () => {
    const error = toApiError(makeAxiosError(500, { message: 'boom' }));

    expect(error.code).toBe('request_failed');
    expect(error.status).toBe(500);
    expect(error.message).toBe('The request could not be completed. Please try again.');
  });

  it('uses network_error when the request never reached the server', () => {
    const error = toApiError(makeAxiosError(null));

    expect(error.code).toBe('network_error');
    expect(error.status).toBe(0);
    expect(error.message).toBe(
      'Unable to reach the server. Please check your connection and try again.',
    );
  });

  it('keeps only well-formed field issues', () => {
    const error = toApiError(
      makeAxiosError(422, {
        code: 'validation_failed',
        errors: [
          { path: 'values.email', code: 'required', message: 'email is required' },
          { path: 42, message: 'bad' } as never,
          { path: 'values.x' } as never,
          null as never,
        ],
      }),
    );

    expect(error.fieldIssues).toEqual([
      { path: 'values.email', code: 'required', message: 'email is required' },
    ]);
    expect(error.message).toBe('Please check the information you entered.');
  });

  it('treats a non-axios failure as an unknown error', () => {
    const error = toApiError(new Error('kaboom'));

    expect(error.code).toBe('unknown_error');
    expect(error.status).toBe(0);
    expect(error.message).toBe('Something went wrong. Please try again.');
  });

  it('treats a thrown string as an unknown error', () => {
    expect(toApiError('kaboom').code).toBe('unknown_error');
  });
});
