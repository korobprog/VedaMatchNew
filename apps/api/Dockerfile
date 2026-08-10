FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

FROM base AS build
ARG MOTIVATION_BUILD_VERSION=dev
RUN echo "Motivation build: ${MOTIVATION_BUILD_VERSION}"
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
# @vedamatch/shared собирается в CommonJS-JS (см. packages/shared/tsconfig.build.json):
# на Node 24 голый `require()` сырого .ts из node_modules падает с
# ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — раньше это не проявлялось только
# потому, что dev-запуск шёл через ts-node/ts-jest, перехватывающие require ДО
# нативного загрузчика Node; в проде такого перехвата нет. turbo сам построит
# shared раньше api благодаря "dependsOn": ["^build"] в turbo.json.
RUN pnpm --filter @vedamatch/api prisma:generate && pnpm turbo run build --filter=@vedamatch/api
RUN pnpm --filter @vedamatch/api deploy --prod /out

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /out /app
COPY --from=build /app/packages/shared /app/packages/shared
COPY --from=build /app/apps/api/dist /app/dist
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate resolve --rolled-back 20260705090000_extend_profile || true; npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
