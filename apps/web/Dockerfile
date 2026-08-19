FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

FROM base AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/web apps/web
# @vedamatch/shared собирается в JS (packages/shared/tsconfig.build.json): package.json
# теперь указывает main на dist/index.js, поэтому без сборки его тут webpack/Turbopack
# не найдёт вовсе. turbo строит shared раньше web через "dependsOn": ["^build"].
RUN pnpm turbo run build --filter=@vedamatch/web

FROM base AS runtime
ENV NODE_ENV=production
# Next.js standalone server.js binds to process.env.HOSTNAME if set. Docker auto-sets
# HOSTNAME to the container ID, which resolves to a single internal network IP and makes
# the server unreachable from other Docker networks (e.g. the Traefik/dokploy network).
# Force it to 0.0.0.0 so the server listens on all interfaces.
ENV HOSTNAME=0.0.0.0
# Non-root: всё дерево принадлежит node, чтобы оптимизатор next/image мог писать
# кэш в apps/web/.next/cache — больше сервер на диск ничего не пишет.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=build --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public /app/apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3   CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
