export const USER_ROLES = ['student', 'admin', 'supervisor'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type UserStatus = 'active' | 'locked' | 'deleted';

/** 与 server/src/user/user.types.ts 的 UserProfile 对齐 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  status: UserStatus;
  /** 前端据此做按钮显隐；服务端仍会自行校验 */
  role: UserRole;
  createdAt: string;
}

export interface LinkedIdentity {
  provider: string;
  email: string | null;
  createdAt: string;
}

export interface LogonResponse {
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserProfile;
  csrfToken: string;
}

export interface MeResponse {
  user: UserProfile;
  identities: LinkedIdentity[];
}

export type LogonRequest =
  | { grant_type: 'otp'; email: string; otp: string }
  | { grant_type: 'password'; email: string; password: string };

export interface OtpAcceptedResponse {
  accepted: boolean;
  expiresInSeconds: number;
}
