FROM node:22-slim AS builder

RUN npm install -g pnpm

WORKDIR /usr/dorkfun

COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./
COPY README.md ./
COPY AGENTS.md ./

COPY packages/core/package.json ./packages/core/
COPY packages/engine/package.json ./packages/engine/
COPY packages/game-ui/package.json ./packages/game-ui/
COPY packages/games/ ./packages/games/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/core/ ./packages/core/
COPY packages/engine/ ./packages/engine/
COPY packages/game-ui/ ./packages/game-ui/
COPY packages/games/ ./packages/games/
COPY apps/web/ ./apps/web/

ARG VITE_API_URL=https://engine.dork.fun
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm --filter=@dorkfun/web build

FROM nginx:alpine
COPY --from=builder /usr/dorkfun/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
