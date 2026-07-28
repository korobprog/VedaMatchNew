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
pnpm seed:dev                              # демо-аккаунты Union (только dev)
cd ../..

pnpm dev                                   # web:3000 + api:4000
```

### Вход по логину и паролю (только dev)

Google OAuth требует реального аккаунта и внешнего редиректа, что мешает
проверять сценарии Union. Для локальной отладки есть вход по паролю:

1. В `.env`: `DEV_AUTH_ENABLED=true` и `NEXT_PUBLIC_DEV_AUTH=true`.
2. `pnpm --filter @vedamatch/api seed:dev` — создаёт 12 демо-профилей Union
   с анкетами, возрастом, активностью и публичными фото
   (`apps/web/public/mock/union`), плюс демо-администратора
   `admin@demo.vedamatch.local` для разбора жалоб и проверки фото.
3. На `/login` появится форма с email демо-аккаунтов; пароль у всех —
   `DEMO_PASSWORD` (по умолчанию `vedamatch`).

API отвергает `POST /auth/dev-login` при `NODE_ENV=production` независимо от
значения `DEV_AUTH_ENABLED`, поэтому прод-образы этот вход не открывают.

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
| POST | `/auth/dev-login` | Вход по email и паролю (только dev) |
| GET | `/auth/dev-accounts` | Список демо-аккаунтов для формы dev-входа |
| POST | `/auth/refresh` | Ротация refresh-токена |
| POST | `/auth/logout` | Выход (отзыв refresh) |
| POST | `/auth/logout-everywhere` | Выход на всех устройствах |
| GET | `/users/me` | Профиль текущего пользователя |
| GET | `/services` | Доступные сервисы каталога |
| POST | `/profile/photo-verification` | Заявка на проверку фото |
| POST | `/union/users/:id/block` | Заблокировать пользователя |
| POST | `/union/users/:id/report` | Пожаловаться на пользователя |
| GET | `/admin/reports` | Очередь жалоб (только admin) |
| GET | `/.well-known/jwks.json` | Публичные ключи для валидации JWT другими сервисами |
