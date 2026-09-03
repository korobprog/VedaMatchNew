#!/bin/sh
# Entrypoint API-контейнера. Запускается от пользователя node (см. Dockerfile).
#
#   1. prisma migrate deploy — применяет невыкатанные миграции (идемпотентно).
#   2. prisma db seed       — справочники/демо-данные; отключается SEED_ON_START=0
#                             (см. docs/review-2026-08-19.md, п. 9: seed на каждом
#                             старте перетирает правки админа в Service/Section).
#   3. exec node dist/main.js — PID 1 отдаём Node, чтобы SIGTERM доходил до приложения.
#
# Одноразовые операции вроде `migrate resolve --rolled-back <name>` сюда не
# зашиваем: их делают руками один раз (docs/prisma-raw-sql-objects.md).
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "docker-entrypoint: DATABASE_URL не задан" >&2
  exit 1
fi

# Generic-хост базы в общей сети — не наша база.
#
# На проде все проекты живут в одной overlay-сети dokploy-network, и алиас
# `postgres` в ней не уникален: после перезапуска демона его может занять
# контейнер соседнего проекта. Тогда api молча уходит в чужой Postgres и
# падает с `P1000: Authentication failed` при полностью исправной своей базе —
# диагностика уводит в сторону, потому что выглядит как неверный пароль.
#
# Раньше от этого спасала sed-подмена хоста в command, но подменять чужую
# строку подключения вслепую хуже, чем не стартовать: с подходящими
# учётными данными `migrate deploy` мог бы записать миграции в чужую базу.
# Поэтому — падаем сразу и с понятным текстом.
#
# В самодостаточном docker-compose.yml (своя приватная сеть, сервис так и
# называется `postgres`) неоднозначности нет — там выставлен
# ALLOW_GENERIC_DB_HOST=1.
db_host=$(printf '%s' "$DATABASE_URL"   | sed -e 's|^[^:]*://||' -e 's|[?].*$||' -e 's|/.*$||' -e 's|.*@||' -e 's|:.*$||'   | tr '[:upper:]' '[:lower:]')

case "${ALLOW_GENERIC_DB_HOST:-0}:$db_host" in
  1:*) ;;
  *:postgres | *:postgresql | *:db | *:database)
    echo "docker-entrypoint: DATABASE_URL указывает на generic-хост '$db_host'." >&2
    echo "  В общей dokploy-network это имя может принадлежать базе чужого проекта." >&2
    echo "  Укажите уникальное имя сервиса (например vedamatch-portal-db-scqe9y)" >&2
    echo "  в переменной DATABASE_URL или выставьте ALLOW_GENERIC_DB_HOST=1," >&2
    echo "  если сеть заведомо приватная." >&2
    exit 1
    ;;
esac

echo "docker-entrypoint: prisma migrate deploy"
npx prisma migrate deploy

# Российский контур: своя база, своя схема, свои миграции. Накатываются только
# когда контур включён обоими условиями. Наличия строки подключения
# недостаточно: она может быть заведена заранее, а решение о том, куда едут
# персональные данные, обязано быть отдельным и осознанным.
#
# Кавычки вокруг значения снимаем: в .env строку подключения часто заключают в
# них, и prisma получает их как часть адреса. Подстановкой
# параметров, а не sed: обратная ссылка в замене — лишний способ незаметно
# обнулить строку.
ru_url="${RU_DATABASE_URL:-}"
case "$ru_url" in
  '"'*'"') ru_url="${ru_url#?}"; ru_url="${ru_url%?}" ;;
  "'"*"'") ru_url="${ru_url#?}"; ru_url="${ru_url%?}" ;;
esac
if [ -n "$ru_url" ] && [ "${RU_CONTOUR_ENABLED:-}" = "true" ]; then
  echo "docker-entrypoint: prisma migrate deploy (российский контур)"
  RU_DATABASE_URL="$ru_url" npx prisma migrate deploy --schema prisma/ru/schema.prisma
else
  echo "docker-entrypoint: российский контур выключен, его миграции пропущены"
fi

if [ "${SEED_ON_START:-1}" != "0" ]; then
  echo "docker-entrypoint: prisma db seed (отключить: SEED_ON_START=0)"
  npx prisma db seed
else
  echo "docker-entrypoint: seed пропущен (SEED_ON_START=0)"
fi

exec node dist/main.js "$@"
