# Контракт сервисного модуля VedaMatch

Шаблон изоляции для всех сервисов экосистемы (Union, Gitabase, Motivation и будущие).
Цель: над каждым сервисом можно работать независимо, не затрагивая портал и другие сервисы.
Эталонная реализация — сервис **Union** (`apps/api/src/modules/union/`, `apps/web/src/app/union/`).

## Backend (`apps/api`)

- Один сервис = одна папка `apps/api/src/modules/<service>/`. Все контроллеры, сервисы, DTO и внутренние хелперы — только внутри неё.
- Модуль **МОЖЕТ** импортировать:
  - `AuthModule` (`AuthGuard`, `@CurrentUser()`);
  - глобальный `PrismaService`;
  - типы из `@vedamatch/shared`.
- Модуль **НЕ МОЖЕТ** импортировать другие фичевые модули и их сервисы (`UsersService`, `CatalogService`, `SelfIdentificationService` и т.д.).
- Данные портального профиля (имя, аватар, город, духовный этап) сервис читает **read-only через PrismaService** из модели `User`. Писать в `User` и в модели других сервисов запрещено.
- Префикс всех маршрутов = slug сервиса: `@Controller('<service>/...')`, например `union/profile`.
- Единственная точка касания портала — одна строка регистрации модуля в `apps/api/src/app.module.ts`.

## База данных (общий Postgres, общая `schema.prisma`)

- Все модели сервиса именуются с префиксом сервиса в PascalCase: `UnionProfile`, `UnionIntention`. Энумы тоже: `UnionIntentionType`.
- Связи (FK) с `User` разрешены; связи с моделями других сервисов — запрещены.
- Модели сервиса добавляются отдельным блоком в конце `apps/api/prisma/schema.prisma` с комментарием-заголовком, например `// ===== Union service =====`.

## Frontend (`apps/web`)

- Группа маршрутов на сервис: `apps/web/src/app/<service>/`. URL-префикс зеркалит API (`/union` ↔ `/union/*` в API).
- Локальные компоненты сервиса — в `apps/web/src/components/<service>/`. Общие компоненты (`header.tsx`) импортировать можно, компоненты другого сервиса — нельзя.
- Свой API-клиент `apps/web/src/lib/<service>-api.ts` поверх общих fetch-хелперов из `lib/api.ts` (авторизация и cookies централизованы, знание эндпоинтов — по сервисам).

## Shared-типы (`packages/shared`)

- Один файл на сервис: `packages/shared/src/<service>.ts`, реэкспорт в `index.ts` через `export * from './<service>'`.
- Файл сервиса может импортировать базовые типы портала (`SpiritualStage`, `Role`), но не типы другого сервиса.

## Каталог

- Единственная связь портала с сервисом — запись `Service` (уникальный `slug`) в БД/seed.
- Для сервисов внутри монолита `url` — относительный путь (`/union`); для внешних — полный URL.
- Видимость по этапам/ролям управляется флагами записи `Service`; сам сервис логику каталога не дублирует.

## Чек-лист нового сервиса

1. Блок моделей с префиксом в `schema.prisma` + миграция.
2. Файл типов в `packages/shared/src/<service>.ts` + реэкспорт.
3. Папка модуля в `apps/api/src/modules/<service>/` + одна строка в `app.module.ts`.
4. Запись сервиса в `apps/api/prisma/seed.ts` (`status: 'coming_soon'` до готовности).
5. Папки `apps/web/src/app/<service>/` и `apps/web/src/components/<service>/`, клиент `lib/<service>-api.ts`.
6. Когда готово — `status: 'active'` и относительный `url` в seed.
