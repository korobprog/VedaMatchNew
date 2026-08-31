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
# Шрифты для подписи на сторис: sharp рисует текст через SVG, а в node:*-alpine
# нет ни одного шрифта — кириллица вышла бы пустыми прямоугольниками. Noto взят
# ради всех трёх языков постов сразу, включая деванагари.
# ffmpeg — наложение той же подписи на ролик, оживляющий иллюстрацию
# (story-video.ts). Кадр модели меньше сторис, поэтому его ещё и
# докадрируют, а это уже не по силам sharp: он не умеет видео.
# apk иногда попадает на реплику зеркала Alpine в момент синхронизации и не
# находит транзитивные so:-зависимости ffmpeg (libasound, libxcb-*, json-c),
# хотя пакеты есть — 5 попыток с паузой пережидают это окно; на второй раз
# подряд стало ясно, что просто "повторить сборку руками" ненадёжно.
RUN i=0; until apk add --no-cache fontconfig font-noto font-noto-devanagari ffmpeg; do \
    i=$((i + 1)); \
    if [ "$i" -ge 5 ]; then echo "apk add failed after $i attempts" >&2; exit 74; fi; \
    echo "apk add failed (attempt $i/5), retrying in 10s..." >&2; \
    sleep 10; \
  done \
  && fc-cache -f
# Всё принадлежит непривилегированному пользователю node (uid 1000 в базовом
# образе); приложение на диск не пишет, так что права только на чтение достаточно.
COPY --from=build --chown=node:node /out /app
# @vedamatch/shared: pnpm deploy кладёт в /out symlink на workspace-пакет, поэтому
# сам пакет нужен рядом. Рантайму хватает собранного dist и package.json
# (main: dist/index.js) — исходники и tsconfig в образ не тащим.
COPY --from=build --chown=node:node /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/dist /app/dist
COPY --chown=node:node apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 0755 /app/docker-entrypoint.sh
USER node
EXPOSE 4000
# /health отвечает 503, если Postgres недоступен (HealthModule) — wget тогда
# завершится ненулевым кодом, и контейнер станет unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health >/dev/null || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
