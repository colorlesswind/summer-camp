# Summer Camp · UI

港科大（广州）夏令营报名系统的前端 SPA：Vue 3 + TypeScript + Vite + Ant Design Vue 4 + Vue Router 4 + Pinia + axios。

当前阶段已完成登录页（学生验证码 / 管理员与导师密码），业务页面（申请列表、申请表、审核）以占位页形式预留路由，下一阶段填充。

## 快速开始

前置条件：

- Node.js ≥ 20.19（本机验证版本 22.14）
- 服务端已启动，默认 `http://localhost:3000`

```bash
cd ui
npm install
npm run dev        # http://localhost:5173
```

其他脚本：

| 命令                | 说明                                 |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Vite 开发服务器（端口 5173，严格）   |
| `npm run build`     | `vue-tsc` 类型检查 + 生产构建到 `dist/` |
| `npm run preview`   | 预览生产构建（端口 4173；需把该来源加入服务端 `CORS_ORIGINS`，`.env.example` 已包含） |
| `npm run typecheck` | 仅做 TypeScript 类型检查             |

## 环境变量

| 变量                    | 说明                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `VITE_API_BASE_URL`     | 请求前缀，默认 `/`。**不能改成 `/api`**，原因见下方 Cookie 说明 |
| `VITE_API_PROXY_TARGET` | 仅开发期：Vite 把 `/user`、`/form`、`/healthz` 代理到该地址   |

开发期代理配置在 [`vite.config.ts`](./vite.config.ts)。生产环境由 Nginx 承担同样的转发。

> **为什么不能加 `/api` 前缀**：服务端把 refresh token 写在 `Path=/user/token` 的 Cookie 里。
> 如果浏览器请求的是 `/api/user/token/refresh`，该 Cookie 不会被携带，access token 过期后就无法刷新。
> 因此浏览器必须直接请求 `/user/*`、`/form/*`，与页面同源。

## 目录结构

```text
ui/
├── resource/logo.png              # 校徽（构建时通过 @resource 别名打包）
├── src/
│   ├── main.ts                    # 应用装配：pinia / AntD 按需组件 / router
│   ├── App.vue                    # ConfigProvider（主题 token）
│   ├── theme.ts                   # 主色、圆角、控件高度
│   ├── api/
│   │   ├── http.ts                # axios、CSRF、401 单飞刷新、会话失效回调
│   │   ├── problem.ts             # problem+json → ApiError（英文文案）
│   │   └── auth.ts                # /user/otp、/user/logon、/user/me、/user/logout
│   ├── assets/styles/             # reset / CSS 变量 / 全局排版
│   ├── components/
│   │   ├── BrandHeader.vue        # 校徽 + 功能枢纽 FUNCTION HUB
│   │   └── AuthCard.vue           # 登录卡片外壳
│   ├── composables/               # useCountdown、useMediaQuery
│   ├── constants/                 # 应用常量、角色首页映射
│   ├── features/auth/
│   │   ├── views/LoginView.vue
│   │   ├── components/            # 学生表单、员工表单、底部按钮
│   │   ├── styles/login.css
│   │   └── messages.ts            # 英文文案集中管理
│   ├── layouts/                   # AuthLayout / MainLayout
│   ├── pages/                     # 403、404、登录后占位页
│   ├── router/                    # 路由表与守卫
│   ├── stores/auth.ts             # 会话状态与登录动作
│   ├── types/                     # 与后端对齐的 DTO
│   └── utils/                     # cookie、csrf、redirect 校验
├── env.d.ts
├── vite.config.ts
└── tsconfig*.json
```

下一阶段会在 `features/` 下新增：

```text
features/application/   # 学生端：状态列表、配置驱动申请表、共享只读详情
features/admin/         # 管理端：列表筛选、详情审核、批量 Send Offer
features/supervisor/    # 导师端：名下申请列表、Recommend / Reject
```

## 路由

| 路径                            | 角色       | 说明                              |
| ------------------------------- | ---------- | --------------------------------- |
| `/login`                        | 游客       | 登录页（学生 / 员工模式切换）     |
| `/`                             | 登录       | 按角色重定向到各自首页            |
| `/applications`                 | student    | 占位：申请状态列表                |
| `/applications/:id`             | student    | 占位：申请表表单                  |
| `/admin/applications`           | admin      | 占位：申请列表                    |
| `/admin/applications/:id`       | admin      | 占位：申请详情                    |
| `/supervisor/applications`      | supervisor | 占位：分配给当前导师的申请        |
| `/supervisor/applications/:id`  | supervisor | 占位：申请详情                    |
| `/403` `/404`                   | 公开       | 错误页                            |

守卫逻辑：首次导航先 `GET /user/me` 恢复会话；未登录访问受保护路由会跳 `/login?redirect=...`；角色不匹配跳 `/403`；已登录访问 `/login` 直接回角色首页。

## 登录说明

- **学生**：邮箱 + 6 位验证码。先点 `Send Verification Code`，验证码 1 小时有效（服务端 `OTP_TTL_SECONDS=3600`），重发冷却 60 秒；首次登录由服务端自动开户。
- **Admin / Supervisor**：点击卡片底部 `Admin / Supervisor login` 切换到邮箱 + 密码模式，账号由服务端环境变量预置（见 `server/.env` 的 `BOOTSTRAP_*`）。
- 服务端错误文案是中文，前端在 `api/problem.ts` 按 `code` 统一映射为英文；未知错误走兜底文案。
- 登录成功后优先回 `?redirect=`（仅允许站内路径），否则按角色回首页。

## 会话与请求

- access / refresh token 只存在于 HttpOnly Cookie；前端读不到，也不写 localStorage。
- 页面刷新后靠 `GET /user/me` 恢复会话。
- 非 GET 请求自动读取 `sc_csrf` Cookie 并带 `X-CSRF-Token` 头（双提交校验）。
- 401 时做一次「单飞刷新 + 重放」：多个并发 401 共享同一个刷新请求；刷新失败才清空状态并回登录页。
- `MainLayout` 提供当前邮箱、角色标签与登出。

## 生产部署

```bash
npm run build
# 将 dist/ 交给 Nginx 等静态服务器
```

Nginx 参考配置（SPA fallback + 三个 API 前缀）：

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /user/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /form/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location = /healthz {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

> 生产环境服务端会下发 `Secure` Cookie，必须通过 HTTPS 访问；同时把 `APP_ORIGIN`、`CORS_ORIGINS` 配成实际前端域名。

## 约定与后续

- Ant Design Vue 采用**按需注册**（见 `src/main.ts`）；新增页面用到新组件时在 `main.ts` 追加 `app.use(...)`。
- 所有 UI 文案为英文，集中在 `features/auth/messages.ts`；下一阶段建议按 feature 拆分 messages。
- 申请表状态枚举、`displayStatus` 与角色端文案将在下一阶段统一放入 `constants/status.ts`。
- 占位页（`pages/PlaceholderView.vue`）仅用于验证登录跳转与角色守卫，业务页面完成后删除。
- 未引入 i18n 库，因为当前只要求英文界面。
