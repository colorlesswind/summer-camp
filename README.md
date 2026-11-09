# summer-camp

```
summer-camp
├── server/   # Express + TypeScript 服务端（认证 /user + 申请表 /form，接口见 server/README.md）
└── ui/       # Vue 3 + Vite 前端 SPA（登录页 / 角色路由 / 申请表页面）
```

## 服务端

```bash
cd server
cp .env.example .env
npm install
npm run migrate
npm run dev
```

详见 [server/README.md](./server/README.md)（第 10 节是申请表模块 `/form` 的接口说明）。

## 前端

```bash
cd ui
npm install
npm run dev        # http://localhost:5173
```

开发期由 Vite 把 `/user`、`/form`、`/healthz` 代理到 `http://localhost:3000`，请先启动服务端。
登录、路由与目录约定见 [ui/README.md](./ui/README.md)。