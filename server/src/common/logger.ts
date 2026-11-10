import pino from 'pino';
import { env } from '../config';

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
      'newPassword',
      'currentPassword',
      '*.newPassword',
      '*.currentPassword',
      'otp',
      '*.otp',
      'code',
      '*.code',
      'token',
      '*.token',
      'accessToken',
      'refreshToken',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
