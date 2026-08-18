# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Команды

Из корня (Turborepo прогоняет по всем пакетам):

```bash
pnpm dev            # web:3000 + api:4000
pnpm build
pnpm lint
pnpm test
```

Точечно по пакету:

```bash
pnpm --filter @vedamatch/api test          # jest, ищет *.spec.ts в apps/api/src
pnpm --filter @vedamatch/api test -- motivation.service   # один файл: аргумент — регэксп пути
pnpm --filter @vedamatch/api test -- -t "имя теста"       # один тест по имени
pnpm --filter @vedamatch/web test          # vitest, jsdom, все 85 файлов
pnpm --filter @vedamatch/web exec vitest run src/lib/plural.spec.ts   # один файл
pnpm --filter @vedamatch/web test:e2e      # playwright
```

База (из `apps/api`):

```bash
pnpm prisma migrate dev     # миграция в dev
pnpm prisma:deploy          # накат в проде
pnpm seed                   # каталог сервисов
pnpm seed:dev               # 12 демо-профилей Union + демо-админ, только dev
```

Первый запуск, вход по паролю без Google OAuth и переменные окружения описаны в
[README.md](README.md); концепция продукта — в [PLAN.md](PLAN.md).

## Архитектура

Монорепо на pnpm workspaces + Turborepo: `apps/api` (NestJS), `apps/web`
(Next.js 16 App Router, Tailwind v4), `packages/shared` (общие типы, собирается
в `postinstall`).

### Контракт сервисного модуля — главное правило репозитория

Портал состоит из изолированных сервисов (Union, Motivation, Market, Contacts,
Notices, Library, Vedabase, Astro…). Полный документ —
[docs/service-module-contract.md](docs/service-module-contract.md), суть:

- Сервис = одна папка `apps/api/src/modules/<service>/`. Контроллеры, сервисы,
  DTO и хелперы живут только в ней.
- **Модуль не импортирует другие фичевые модули.** Разрешены `AuthModule`,
  глобальный `PrismaService`, типы из `@vedamatch/shared` и `EventEmitter2`.
  Общие хелперы дублируются внутри модуля, а не импортируются из чужого.
- Связь между сервисами — только через шину доменных событий
  (`EventEmitterModule`, подключена в `app.module.ts`). Событие
  самодостаточно: подписчик не имеет права дочитывать недостающее из чужих
  таблиц. Формулировки для пользователя собирает подписчик, издатель сообщает
  факт.
- Read-only из чужого доступны ровно четыре портальные модели: `User`,
  `UserBlock`, `Community`, `CommunityMember`. Список исчерпывающий.
- Префикс маршрутов = slug сервиса (`@Controller('union/...')`). Единственная
  точка касания портала — строка регистрации модуля в `app.module.ts`.
- Эталон соблюдения — **Market**. `union-chat.service.ts` и `ContactsModule`
  нарушают контракт исторически; копировать их устройство нельзя.

### База

Один Postgres и одна `apps/api/prisma/schema.prisma` на всё. Модели сервиса
именуются с префиксом (`MotivationPost`, `UnionProfile`), энумы тоже, и
добавляются отдельным блоком в конце файла. FK на `User` разрешены, FK на
модели другого сервиса — нет.

### Фронтенд

Зеркалит API: группа маршрутов `apps/web/src/app/<service>/`, компоненты
`apps/web/src/components/<service>/`, свой клиент
`apps/web/src/lib/<service>-api.ts` поверх общих fetch-хелперов из `lib/api.ts`.
Компоненты чужого сервиса не импортируются.

### Аутентификация и защита маршрутов

Google OIDC + собственные RS256 JWT (jose), refresh в httpOnly cookie, JWKS-
эндпоинт под будущий SSO. На вебе доступ режет [proxy.ts](apps/web/src/proxy.ts)
по наличию cookie `access_token`: всё, кроме `/` и списков `publicPrefixes` /
`publicFiles`, редиректится на лендинг с `?returnTo=`. Статические файлы, нужные
гостю, обязаны быть в `publicFiles` — matcher исключает только `svg|png|jpg|ico`,
поэтому `.js` через него проходит и редиректится в HTML.

### Имя пользователя наружу

У `User` два имени: мирское `name` и необязательное `spiritualName`. Любой DTO
наружу заполняет `name` результатом `resolveDisplayName()` из
`@vedamatch/shared`, а Prisma-`select` рядом обязан тянуть `spiritualName`.
Исключение — админка, модерация и поддержка: там осознанно мирское имя.

### Фоновая работа

`MotivationWorkerService` — единственный воркер: тик раз в 30 с под Redis-лизом
(`SET NX PX`), клейм задачи через `updateMany` с проверкой статуса, ретраи и
восстановление зависших по `updatedAt`. Образец для любой новой фоновой стадии.

## Дизайн-система

Токены — в `apps/web/src/app/globals.css`. Светлая тема на `:root`, тёмная в
`[data-theme="dark"]`, переключатель на три состояния.

- **Только токены.** Фон `--vm-bg-0/1/2`, текст `--vm-text-0/1/2`, акценты
  `--vm-magenta` / `--vm-cyan` / `--vm-gold`, стекло `--vm-glass*`. Хардкод
  `#RRGGBB` переживёт переключение темы и останется от чужой.
- **Цвет определяется в обеих темах.** Токен, заданный только в одном блоке,
  молча наследует чужое значение.
- **Шрифты по назначению.** `--font-display` (Unbounded) — заголовки,
  `--font-body` (Manrope) — текст, `--font-mono` — код и цифры.
- **Контраст ≥ 4.5:1** (3:1 для ≥24px либо ≥18.66px жирного), считать поверх
  фактической подложки: под стеклом фон композитный, а не тот, что записан в
  `background-color`. Замеренные исключения: `--vm-cyan` на светлой теме даёт
  3.75:1 при 14px, `--vm-magenta` — 4.46:1; мелким текстом их не использовать.
- **Фокус не отключается.** Глобальный `*:focus-visible` в `globals.css` даёт
  обводку `--vm-magenta`; локальный `outline: none` без замены — регресс.
- **Анимации уважают `prefers-reduced-motion`** — блок в `globals.css` уже есть.
- **Декоративное не размечается заголовками.** Текст в макетах и превью ломает
  порядок h1→h2→h3 для скринридера.

Проверять экранами, а не на глаз: установлены скиллы `accessibility`,
`core-web-vitals`, `performance`, `seo`, `best-practices`, `web-quality-audit`.

## Тесты

`*.spec.ts` лежат рядом с кодом. Чистая логика выносится в отдельный модуль и
покрывается тестом, даже когда обёртка вокруг неё не тестируется — образец
`story-image.ts` (`buildStoryOverlaySvg`, `wrapText`, `clampLines`) при
нетестируемом воркере. Тот же приём применять к сборке аргументов внешних
утилит.
