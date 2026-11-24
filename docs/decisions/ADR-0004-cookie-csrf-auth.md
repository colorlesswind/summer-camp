# ADR-0004：认证用 HttpOnly Cookie + CSRF 双提交，一人一角色

- 状态：Accepted（2026-11-22 回溯补录，依据代码基线 `0a63c1e`）
- 涉及区域：`server/src/user/auth/**`、`server/src/user/oauth/**`、`server/src/middleware/{csrf,trusted-origin,authenticate,authorize}.ts`

## 背景

前端是 SPA，与 API 同源部署（生产由反向代理统一入口）。
需要防 XSS 窃取凭证、防 CSRF，并支持邮箱密码、邮箱 OTP、GitHub OAuth / OIDC 三种身份来源。

## 选项

| 选项 | 代价 |
| --- | --- |
| A token 存 localStorage，请求头携带 | 一旦 XSS 即失守；无法用 HttpOnly 保护 |
| B HttpOnly Cookie + CSRF 双提交 | 需要 CSRF 头与 Origin 校验，配置项较多 |
| C B + 多角色账号体系 | 权限模型复杂化，当前需求不需要 |

## 决策

采用 B，并约束为一人一角色：

- access token：HttpOnly、`SameSite=Lax`、`Path=/`；
- refresh token：HttpOnly、`SameSite=Strict`、`Path=/user/token`；
- CSRF token：非 HttpOnly cookie + `x-csrf-token` 请求头，常量时间比较；
- 角色存 `users.role`，每次请求实时读取，不写入 access token。

## 理由

- HttpOnly 使 XSS 无法直接读取凭证；refresh 路径收窄减少携带面。
- 双提交 + Origin 校验覆盖 Cookie 自动携带的 CSRF 风险。
- 角色实时读取保证管理员改角色后立即生效，避免 token 过期前仍持旧权限。

## 后果

- 所有写请求必须带 CSRF 头；新增前端请求封装不得遗漏。
- 部署域名变化时 `APP_ORIGIN` / `CORS_ORIGINS` 必须同步，否则被 `trusted-origin` 拦为 403。
- 新增身份来源（如微信）只能扩展 `identity-provider`，最终必须收敛到本系统 `user_id` + 同一套 cookie。
- 不允许为方便调试而放开 CSRF 或把 token 暴露给 JS。

## 回滚

若改为无状态 Bearer：需要同时提供 CSRF 替代防护与刷新策略，并为现有前端请求层做迁移；
切换期间两种凭证不得同时被接受。

## 证据

| 位置 | 说明 |
| --- | --- |
| `server/src/user/auth/cookies.ts` | 三类 cookie 的属性与 `Path` 约定 |
| `server/src/middleware/csrf.ts` | 双提交校验（cookie 与 `x-csrf-token` 常量时间比较） |
| `server/src/middleware/trusted-origin.ts` | Origin 白名单 |
| `server/src/user/user.types.ts` | `USER_ROLES`；角色实时读取说明 |
| `server/src/middleware/authorize.ts` | 基于 `users.role` 的路由级权限 |
| `server/src/user/oauth/identity-provider.ts` | 第三方身份的扩展点 |
