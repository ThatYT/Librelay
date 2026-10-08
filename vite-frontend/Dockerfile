# 多阶段构建 - 构建阶段
#
# --platform=$BUILDPLATFORM 很关键:CI 是 amd64+arm64 双架构构建,不加这个的话
# arm64 那一路会在 QEMU 模拟里跑完整个 npm install + vite build —— 慢 3~5 倍,
# 而且经常直接挂(内存、原生模块编译)。
# 而前端产物就是一堆 HTML/JS/CSS 静态文件,跟 CPU 架构毫无关系,
# 只有下面的 nginx 运行阶段才需要分架构。
FROM --platform=$BUILDPLATFORM node:22.16.0 AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@11.19.0
RUN pnpm install --frozen-lockfile

COPY . .
# vite build 吃内存,小内存 VPS 上会 JS heap OOM;调大 Node 老生代堆上限
ARG APP_VERSION=0.0.0
ENV APP_VERSION=$APP_VERSION
ARG NODE_BUILD_HEAP=1536
RUN NODE_OPTIONS=--max-old-space-size=$NODE_BUILD_HEAP pnpm run build

# 生产阶段
FROM nginx:stable-alpine AS production-stage
ARG APP_VERSION=0.0.0
LABEL org.opencontainers.image.version=$APP_VERSION
ARG BUILD_COMMIT=dev
LABEL org.opencontainers.image.revision=$BUILD_COMMIT

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 