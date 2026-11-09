# summer-camp

```
summer-camp
├── server/   # Express + TypeScript 服务端（认证 /user + 申请表 /form，接口见 server/README.md）
└── ui/       # 前端 SPA
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