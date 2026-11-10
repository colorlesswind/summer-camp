import { pool } from '../db/pool';
import { logger } from '../common/logger';
import { truncate } from '../common/crypto';

export type AuditEvent =
  | 'register'
  | 'verify_email'
  | 'otp_request'
  | 'logon'
  | 'refresh'
  | 'logout'
  | 'password_change'
  | 'oauth_authorize'
  | 'oauth_callback'
  | 'identity_link'
  | 'bootstrap_account';

export type AuditResult = 'success' | 'failure' | 'duplicate';

export interface AuditEntry {
  event: AuditEvent;
  result: AuditResult;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * 审计写入不能影响主流程：数据库异常只记日志，不向上抛。
 */
export const auditLog = {
  async write(entry: AuditEntry): Promise<void> {
    try {
      await pool.execute(
        `INSERT INTO auth_audit (user_id, email, event, result, ip, user_agent, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.userId ?? null,
          entry.email ?? null,
          entry.event,
          entry.result,
          truncate(entry.ip, 64),
          truncate(entry.userAgent, 255),
          entry.meta ? JSON.stringify(entry.meta) : null,
          new Date(),
        ],
      );
    } catch (error) {
      logger.warn({ err: error, event: entry.event }, 'audit write failed');
    }
  },
};
