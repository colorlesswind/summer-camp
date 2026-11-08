-- =====================================================================
-- 001_init.sql —— 认证模块初始结构
-- 约定：
--   1. 主键统一 26 位 ULID（字符串），天然有序且可分布式生成
--   2. 时间统一 DATETIME(3)，应用层一律使用 UTC
--   3. 邮箱在应用层归一化为小写，唯一索引兜底防并发重复注册
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id                CHAR(26)     NOT NULL,
  primary_email     VARCHAR(255) NOT NULL,
  display_name      VARCHAR(64)  NULL,
  email_verified_at DATETIME(3)  NULL,
  status            VARCHAR(16)  NOT NULL DEFAULT 'active', -- active | locked | deleted
  created_at        DATETIME(3)  NOT NULL,
  updated_at        DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (primary_email),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 第三方身份：一个用户可绑定多个 provider；一个 provider 账号只对应一个用户
CREATE TABLE IF NOT EXISTS identities (
  id               CHAR(26)     NOT NULL,
  user_id          CHAR(26)     NOT NULL,
  provider         VARCHAR(64)  NOT NULL, -- github | oidc:<issuer> | wechat ...
  provider_user_id VARCHAR(191) NOT NULL,
  email_at_provider VARCHAR(255) NULL,
  profile_json     JSON         NULL,
  created_at       DATETIME(3)  NOT NULL,
  updated_at       DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_identities_provider_user (provider, provider_user_id),
  UNIQUE KEY uk_identities_user_provider (user_id, provider),
  KEY idx_identities_user (user_id),
  CONSTRAINT fk_identities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 本地密码。与 users 分离，方便后续做「无密码账号」或迁移到 argon2id
CREATE TABLE IF NOT EXISTS password_credentials (
  user_id       CHAR(26)     NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  algo          VARCHAR(32)  NOT NULL DEFAULT 'bcrypt',
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_password_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 一次性验证码（登录 / 验证邮箱 / 重置密码共用，用 purpose 区分）
-- 只存 HMAC 值，不存明文
CREATE TABLE IF NOT EXISTS otp_challenges (
  id          CHAR(26)    NOT NULL,
  email       VARCHAR(255) NOT NULL,
  user_id     CHAR(26)    NULL,
  purpose     VARCHAR(32) NOT NULL, -- logon | verify_email | reset_password
  code_hash   CHAR(64)    NOT NULL,
  attempts    INT         NOT NULL DEFAULT 0,
  max_attempts INT        NOT NULL DEFAULT 5,
  expires_at  DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  request_ip  VARCHAR(64) NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_otp_email_purpose (email, purpose, created_at),
  KEY idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- refresh token：只存 sha256 摘要；family_id 用于「旋转 + 复用检测」
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti         CHAR(26)     NOT NULL,
  user_id     CHAR(26)     NOT NULL,
  family_id   CHAR(26)     NOT NULL,
  parent_jti  CHAR(26)     NULL,
  token_hash  CHAR(64)     NOT NULL,
  amr         VARCHAR(64)  NOT NULL DEFAULT 'password', -- 认证方式：password | otp | github ...
  user_agent  VARCHAR(255) NULL,
  ip          VARCHAR(64)  NULL,
  expires_at  DATETIME(3)  NOT NULL,
  revoked_at  DATETIME(3)  NULL,
  revoke_reason VARCHAR(64) NULL,
  created_at  DATETIME(3)  NOT NULL,
  PRIMARY KEY (jti),
  UNIQUE KEY uk_refresh_hash (token_hash),
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_family (family_id),
  KEY idx_refresh_expires (expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- access token 的 jti 黑名单：登出 / 改密码时立刻生效
CREATE TABLE IF NOT EXISTS jwt_denylist (
  jti        CHAR(36)    NOT NULL,
  user_id    CHAR(26)    NULL,
  reason     VARCHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (jti),
  KEY idx_denylist_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 第三方授权流程的临时状态（state / PKCE verifier / nonce）
CREATE TABLE IF NOT EXISTS oauth_states (
  state         VARCHAR(64)  NOT NULL,
  provider      VARCHAR(64)  NOT NULL,
  code_verifier VARCHAR(128) NOT NULL,
  nonce         VARCHAR(128) NULL,
  redirect_to   VARCHAR(512) NULL,
  link_user_id  CHAR(26)     NULL,
  expires_at    DATETIME(3)  NOT NULL,
  created_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (state),
  KEY idx_oauth_states_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 审计日志：登录成败、注册、绑定、改密等，便于排查与风控
CREATE TABLE IF NOT EXISTS auth_audit (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    CHAR(26)     NULL,
  email      VARCHAR(255) NULL,
  event      VARCHAR(64)  NOT NULL,
  result     VARCHAR(16)  NOT NULL, -- success | failure | duplicate
  ip         VARCHAR(64)  NULL,
  user_agent VARCHAR(255) NULL,
  meta_json  JSON         NULL,
  created_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_email_event (email, event, created_at),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 限流事件表：MySQL 版滑动窗口计数器。
-- 后续切 Redis 只需替换 RateLimitStore 实现，业务代码不用改。
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bucket     VARCHAR(160) NOT NULL,
  created_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rate_bucket (bucket, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
