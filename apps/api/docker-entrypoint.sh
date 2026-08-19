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

echo "docker-entrypoint: prisma migrate deploy"
npx prisma migrate deploy

if [ "${SEED_ON_START:-1}" != "0" ]; then
  echo "docker-entrypoint: prisma db seed (отключить: SEED_ON_START=0)"
  npx prisma db seed
else
  echo "docker-entrypoint: seed пропущен (SEED_ON_START=0)"
fi

exec node dist/main.js "$@"
