FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /usr/dorkfun

COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

COPY packages/core/package.json ./packages/core/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/engine/package.json ./packages/engine/
COPY packages/games/ ./packages/games/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY packages/games/ ./packages/games/
COPY apps/server/ ./apps/server/

RUN pnpm --filter=@dorkfun/core build
RUN pnpm --filter=@dorkfun/protocol build
RUN pnpm --filter=@dorkfun/engine build
RUN pnpm --filter './packages/games/**' build
RUN pnpm --filter=@dorkfun/server build

RUN pnpm --filter=@dorkfun/server deploy --prod --legacy /app

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app .
COPY --from=builder /usr/dorkfun/packages/core/dist ./node_modules/@dorkfun/core/dist
COPY --from=builder /usr/dorkfun/packages/protocol/dist ./node_modules/@dorkfun/protocol/dist
COPY --from=builder /usr/dorkfun/packages/engine/dist ./node_modules/@dorkfun/engine/dist
COPY --from=builder /usr/dorkfun/packages/games/ /tmp/games/
RUN for game_dir in /tmp/games/*/; do \
      game=$(basename "$game_dir"); \
      if [ -d "$game_dir/dist" ]; then \
        mkdir -p "./node_modules/@dorkfun/game-$game" && \
        cp -r "$game_dir/dist" "./node_modules/@dorkfun/game-$game/dist"; \
      fi; \
    done && rm -rf /tmp/games

EXPOSE 8080

CMD ["node", "dist/index.js"]
