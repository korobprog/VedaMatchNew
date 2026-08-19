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
# Разделы библиотеки и каталог Рынка сид только создаёт (их правит админ);
# чтобы перезаписать их из файлов данных: SEED_REFRESH_ADMIN_EDITABLE=1 pnpm seed
pnpm seed:dev                              # демо-аккаунты Union (только dev)
pnpm seed:vedabase                         # демо-книга «Бхагавад-гита», 2 главы (только dev)
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

## Тариф и подписка

Единый тариф — **108 ₽ или 2 USDT в месяц**, первый месяц бесплатно. Цены
задаются в двух местах и должны совпадать: `VEDAMATCH_PLAN`
([apps/api/src/modules/billing/subscription.ts](apps/api/src/modules/billing/subscription.ts))
и `PLAN` ([apps/web/src/lib/plan.ts](apps/web/src/lib/plan.ts)).

Пробный месяц не требует отдельной активации: `User.trialEndsAt` заполняется
миграцией, а у аккаунтов без значения отсчёт идёт от даты регистрации. Оплата
пока принимается вне сервиса — пользователь пишет в поддержку, администратор
продлевает доступ кнопками «+1/+3/+12 мес» на странице `/admin/users/<id>`.
Платёжный провайдер не подключён.

## Поддержка (тикеты)

- `/support` — форма обращения. Работает без авторизации: гостю нужен email или
  Telegram, после отправки он получает секретную ссылку `/support/track/<token>`.
- Авторизованный пользователь видит там же список своих обращений со статусом и
  временем создания, переписка — на `/support/<id>`.
- Администратор разбирает очередь на `/admin/tickets`: фильтры по статусу,
  подсветка тикетов без первого ответа, ответ пользователю, внутренние заметки,
  смена статуса и назначение исполнителя.

Уведомления в Telegram или на почту не подключены — новые обращения видны в
админке.

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
| GET | `/billing/plan` | Публичный тариф (108 ₽ / 2 USDT в месяц, 30 дней пробно) |
| GET | `/billing/me` | Статус подписки текущего пользователя |
| PATCH | `/admin/billing/users/:id` | Продление или сброс оплаченного доступа (admin) |
| GET | `/billing/donation` | Реквизиты пожертвований для кнопки «Поддержать развитие» (пусто, пока админ не включил) |
| GET/PATCH | `/admin/billing/donation` | Реквизиты пожертвований: включение, текст, список строк (admin) |
| GET | `/motivation/feed` | Лента мотивации: порядок «свежее → непросмотренное → повтор», `filter=favorites` — избранное |
| POST/DELETE | `/motivation/posts/:id/like` | Публичный лайк со счётчиком (в отличие от личного избранного) |
| GET | `/motivation/reels/quota` | Лимит «своих рилсов» на сегодня (админам не считается) |
| GET/POST | `/motivation/reels` | Мои рилсы / создать свой рилс: цитата своя или из Vedabase (сверяется с главой) → ИИ-модерация → генерация |
| GET | `/motivation/reels/:id` | Стадия рилса (`ai_review`, `admin_review`, `rejected`, `generating`, `image_review`, `published`, `failed`) и причина отказа |
| POST | `/motivation/reels/:id/appeal` | Обращение к администратору после отказа (одно на рилс) |
| GET | `/motivation/reels/books` | Книги с оглавлением для выбора цитаты в мастере |
| GET | `/motivation/reels/books/:book/chapters/:chapter` | Фрагменты главы, пригодные для рилса |
| GET | `/motivation/reels/sources` | Поиск фрагмента по словам |
| POST | `/motivation/reels/:id/animate` | Оживить свой рилс в видео (если включено в настройках) |
| POST | `/motivation/reels/:id/image` | Своя картинка для рилса: кадрирование 9:16, всегда ручная проверка |
| POST | `/motivation/posts/:id/report` | Жалоба на рилс участника; набрав порог, рилс скрывается до решения админа |
| POST | `/motivation/posts/:id/postcard` | Открытка из кадра поста и поздравления |
| GET | `/motivation/postcards/event` | Ближайший праздник для открытки |
| GET | `/admin/motivation/reels` | Рилсы участников: фильтры, вердикты ИИ, счётчики за сегодня (admin) |
| GET | `/admin/motivation/analytics` | Сводка: лента, участники, расход (admin) |
| GET/POST | `/admin/motivation/events` | Справочник праздников для открыток (admin) |
| POST | `/support/tickets` | Создать обращение (работает без авторизации) |
| GET | `/support/tickets/track/:token` | Гостевой просмотр обращения по секретной ссылке |
| POST | `/support/tickets/track/:token/messages` | Ответ гостя в своём обращении |
| GET | `/support/my/tickets` | Обращения пользователя в кабинете |
| POST | `/support/my/tickets/:id/messages` | Сообщение в своё обращение |
| GET | `/admin/support/tickets` | Очередь обращений (только admin) |
| PATCH | `/admin/support/tickets/:id` | Статус, категория, исполнитель, пометка (admin) |
| POST | `/admin/support/tickets/:id/messages` | Ответ поддержки или внутренняя заметка (admin) |
| GET | `/.well-known/jwks.json` | Публичные ключи для валидации JWT другими сервисами |
