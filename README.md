# VedaMatch Portal

Единая точка входа во все сервисы экосистемы VedaMatch. Подробная концепция — в [PLAN.md](PLAN.md).

## Стек

- **Монорепо**: pnpm workspaces + Turborepo
- **apps/web** — Next.js 16 (App Router, Tailwind CSS)
- **apps/api** — NestJS (модули auth / users / catalog), Prisma, PostgreSQL
- **packages/shared** — общие TypeScript-типы
- **Auth** — Google OIDC (openid-client) + собственные RS256 JWT (jose), refresh-токены в httpOnly cookie, JWKS-эндпоинт для будущего SSO

## Быстрый старт (dev)

```bash
pnpm install
cp .env.example .env
node apps/api/scripts/generate-keys.mjs   # вставьте JWT_PRIVATE_KEY_BASE64 в .env

docker compose up -d postgres
cd apps/api
pnpm prisma migrate dev                    # миграции
pnpm seed                                  # каталог сервисов
cd ../..

pnpm dev                                   # web:3000 + api:4000
```

### Google OAuth

1. Создайте OAuth Client ID в [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (тип Web application).
2. Authorized redirect URI: `http://localhost:4000/auth/google/callback` (в проде — `https://api.<домен>/auth/google/callback`).
3. Заполните `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET` в `.env`.

## Продакшен

```bash
docker compose --profile prod up -d --build
```

Поднимает postgres + api + web + Caddy (автоматический HTTPS). Домены задаются в [Caddyfile](Caddyfile), при старте api применяются миграции.

## Эндпоинты API

| Метод | Путь | Описание |
|---|---|---|
| GET | `/auth/google` | Старт входа через Google |
| GET | `/auth/google/callback` | OAuth callback |
| POST | `/auth/refresh` | Ротация refresh-токена |
| POST | `/auth/logout` | Выход (отзыв refresh) |
| POST | `/auth/logout-everywhere` | Выход на всех устройствах |
| GET | `/users/me` | Профиль текущего пользователя |
| GET | `/services` | Доступные сервисы каталога |
| GET | `/.well-known/jwks.json` | Публичные ключи для валидации JWT другими сервисами |
