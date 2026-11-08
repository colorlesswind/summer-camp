# summer-camp

```
summer-camp
├── server/   # Express + TypeScript 服务端（认证模块见 server/README.md）
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

详见 [server/README.md](./server/README.md)。