import type { RowDataPacket } from 'mysql2/promise';

export type UserStatus = 'active' | 'locked' | 'deleted';

/**
 * 系统固定三种角色（方案 A：一个账号只有一种角色）。
 * 身份存 users.role，权限规则写在代码里（form/application.state.ts）。
 */
export const USER_ROLES = ['student', 'admin', 'supervisor'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** 认证方式，写入 JWT 的 amr 声明，便于前端/下游区分登录来源。 */
export type AuthMethod = 'password' | 'otp' | 'github' | 'oidc';

export type OtpPurpose = 'logon' | 'verify_email' | 'reset_password';

export interface UserRow extends RowDataPacket {
  id: string;
  primary_email: string;
  display_name: string | null;
  email_verified_at: Date | null;
  status: UserStatus;
  role: UserRole;
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
  /**
   * 每次请求实时从 users.role 读取，不放进 access token：
   * 角色被降级/变更后立即生效，不需要等 token 过期或把会话全部踢掉。
   */
  role: UserRole;
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
  /** 前端据此做按钮显隐；服务端仍然必须自行校验，不能只依赖前端 */
  role: UserRole;
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
  role: row.role,
  createdAt: row.created_at.toISOString(),
});
