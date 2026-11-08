import type { Request } from 'express';
import { truncate } from './crypto';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export const requestContext = (req: Request): RequestContext => ({
  ip: truncate(req.ip ?? null, 64),
  userAgent: truncate(req.get('user-agent') ?? null, 255),
});
