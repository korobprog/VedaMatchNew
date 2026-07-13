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
RUN pnpm --filter @vedamatch/web build

FROM base AS runtime
ENV NODE_ENV=production
# Next.js standalone server.js binds to process.env.HOSTNAME if set. Docker auto-sets
# HOSTNAME to the container ID, which resolves to a single internal network IP and makes
# the server unreachable from other Docker networks (e.g. the Traefik/dokploy network).
# Force it to 0.0.0.0 so the server listens on all interfaces.
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone /app
COPY --from=build /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build /app/apps/web/public /app/apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
