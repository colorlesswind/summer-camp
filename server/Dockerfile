# syntax=docker/dockerfile:1
#
# summer-camp 后端镜像
#   - 三阶段构建：编译 TS -> 只装生产依赖 -> 精简运行镜像
#   - 镜像内不含 .env / 源码 / devDependencies，配置全部走环境变量
#   - 构建：docker build -t summer-camp-server:demo ./server

# ---------- 1. 构建：装全部依赖并编译 TypeScript ----------
FROM node:22-alpine AS builder
WORKDIR /app

# 先只拷 lockfile，依赖没变时这一层直接命中缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# build = tsc 输出 dist/ + 把 src/db/migrations 复制到 dist/db/migrations
# （migrate.js 用 __dirname/migrations 定位 SQL，少了这步迁移会找不到目录）
RUN npm run build

# ---------- 2. 生产依赖 ----------
FROM node:22-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- 3. 运行 ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# tsconfig 开了 sourceMap，让堆栈直接映射回 TS 行号
ENV NODE_OPTIONS=--enable-source-maps

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# node 官方镜像自带非 root 用户；容器内无需写文件，用只读权限即可
USER node

EXPOSE 3000

# 直接用 node 启动，不要走 `npm start`：多一层 npm 会吞掉 SIGTERM，
# 导致 index.ts 里的优雅关闭逻辑收不到信号
CMD ["node", "dist/index.js"]
