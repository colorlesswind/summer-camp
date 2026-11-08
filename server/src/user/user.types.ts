import type { RowDataPacket } from 'mysql2/promise';

export type UserStatus = 'active' | 'locked' | 'deleted';

/** 认证方式，写入 JWT 的 amr 声明，便于前端/下游区分登录来源。 */
export type AuthMethod = 'password' | 'otp' | 'github' | 'oidc';

export type OtpPurpose = 'logon' | 'verify_email' | 'reset_password';

export interface UserRow extends RowDataPacket {
  id: string;
  primary_email: string;
  display_name: string | null;
  email_verified_at: Date | null;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface IdentityRow extends RowDataPacket {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  email_at_provider: string | null;
  profile_json: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface OtpChallengeRow extends RowDataPacket {
  id: string;
  email: string;
  user_id: string | null;
  purpose: OtpPurpose;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  request_ip: string | null;
  created_at: Date;
}

export interface RefreshTokenRow extends RowDataPacket {
  jti: string;
  user_id: string;
  family_id: string;
  parent_jti: string | null;
  token_hash: string;
  amr: string;
  user_agent: string | null;
  ip: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
  created_at: Date;
}

export interface OAuthStateRow extends RowDataPacket {
  state: string;
  provider: string;
  code_verifier: string;
  nonce: string | null;
  redirect_to: string | null;
  link_user_id: string | null;
  expires_at: Date;
  created_at: Date;
}

/** 由 authenticate 中间件解析出的登录态。 */
export interface AuthContext {
  userId: string;
  jti: string;
  sessionId: string;
  amr: AuthMethod[];
  /** access token 过期时间（epoch 秒） */
  expiresAt: number;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  status: UserStatus;
  createdAt: string;
}

export interface LinkedIdentity {
  provider: string;
  email: string | null;
  createdAt: string;
}

export const toUserProfile = (row: UserRow): UserProfile => ({
  id: row.id,
  email: row.primary_email,
  displayName: row.display_name,
  emailVerified: row.email_verified_at !== null,
  status: row.status,
  createdAt: row.created_at.toISOString(),
});
