-- =====================================================================
-- 002_rbac.sql —— 角色访问控制（RBAC，方案 A：一个账号只有一种角色）
-- 约定：
--   1. 角色只是「身份属性」，存 users 表；具体权限规则写在代码里
--      （form/application.state.ts），不做 role/permission 表化
--   2. 用 VARCHAR + CHECK 而不是 ENUM：新增角色只需改 CHECK，不用重建表
--   3. 注册接口永远不接受 role 字段，新账号默认 student；
--      admin / supervisor 由运维 SQL 或后续后台接口授予
-- =====================================================================

ALTER TABLE users
  ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'student'
    COMMENT 'student | admin | supervisor' AFTER status,
  ADD KEY idx_users_role (role);

-- MySQL 8.0.16+ 才真正强制 CHECK，本项目要求 MySQL 8
ALTER TABLE users
  ADD CONSTRAINT chk_users_role CHECK (role IN ('student', 'admin', 'supervisor'));
