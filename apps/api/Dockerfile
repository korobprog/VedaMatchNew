FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN cd apps/api && pnpm prisma generate && pnpm build
RUN pnpm --filter @vedamatch/api deploy --prod /out

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /out /app
COPY --from=build /app/apps/api/dist /app/dist
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
