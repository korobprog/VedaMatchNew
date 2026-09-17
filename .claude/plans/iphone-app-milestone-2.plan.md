# План: VedaMatch для iPhone — веха 2 «Мини-приложение и вход через Telegram»

**Исходный PRD**: [docs/prds/iphone-app.prd.md](../../docs/prds/iphone-app.prd.md)
**Выбранная веха**: 2 — из бота открывается мини-приложение; новый участник
входит одним касанием, существующий — после привязки (привязка — веха 3)
**Сложность**: средняя
**Бот**: `@vedamatch_bot` (уже есть)
**Карточка**: VED-255

## Решения (17.09.2026)

- Аккаунт из Telegram получает служебную почту `tg-<id>@users.vedamatch.invalid`
  (домен `.invalid` зарезервирован RFC 2606 — письмо туда не уйдёт никогда).
  Схема `User` не меняется.
- Вход через Telegram включается только в контуре `com` (`vedamatch.com`,
  `ios.vedamatch.com`). На `vedamatch.ru` способы входа ограничены (406-ФЗ,
  `auth-providers.service.ts`).
- Для `vedamatch.com` включаются и Google с Яндексом: сейчас
  `api.vedamatch.com/auth/providers` отдаёт пустой список, и кнопка «Яндекс» на
  `ios.vedamatch.com` отвечает «способ недоступен».

## Что уже есть и на что опираемся

| Факт | Где |
|---|---|
| Способы входа — `UserIdentity` (`provider`, `externalId`), поиск и заведение аккаунта — `IdentityService.resolve` | `apps/api/src/modules/auth/identity.service.ts` |
| Видимость способа по домену портала — `AuthProviderSetting`, проверка `assertEnabled` | `auth-providers.service.ts`, миграция `20260903130000_auth_provider_settings` |
| Выдача cookie сессии по контуру — `issueTokens` | `auth.service.ts` |
| Закрытая регистрация — `assertRegistrationOpen` через `ResolveHooks.beforeCreate` | `auth.service.ts` |
| Веб-версия с сессией на cookie | `apps/mobile/src/lib/auth/session.web.tsx` (PR #368) |
| Проверка подписи мини-приложения — локальная, без обращения к Telegram | [core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) |
| Сервер плохо достаёт до Bot API (для входа не нужен; для уведомлений — веха 4, `telegram-relay` в Dokploy) | `docs/chat-calls-plan.md:61` |

Проверка подписи по документации: строка — все поля `initData`, кроме `hash`,
по алфавиту, `key=value` через перевод строки; ключ —
`HMAC_SHA256(message = bot_token, key = "WebAppData")`; подпись —
`hex(HMAC_SHA256(строка, ключ))`, сравнение постоянного времени. `signature`
в строке остаётся (исключается только для проверки Ed25519 третьими лицами).

## Образцы для повторения

| Категория | Источник | Образец |
|---|---|---|
| Разбор профиля провайдера | `yandex.provider.ts` (`mapYandexProfile`) + spec | чистая функция «ответ провайдера → `ProviderProfile`» |
| Проверка ненадёжного ввода | `contour.ts` (`resolveReturnOrigin`) + spec | всё сомнительное → отказ, spec на каждый отказ |
| Вход со своим провайдером | `auth.service.ts` (`handleYandexCallback`) | `assertEnabled` → `identities.resolve(..., beforeCreate)` → cookie сессии |
| Enum + данные в миграции | `20260903120000_user_identity`, `20260903130000_auth_provider_settings` | `ALTER TYPE … ADD VALUE`, `INSERT`/`UPDATE` с комментарием |
| Платформенный файл веба | `session.web.tsx`, `cookie-session.ts` + spec | чистая логика отдельно, React только склеивает |

## Файлы

| Файл | Действие | Зачем |
|---|---|---|
| `apps/api/prisma/schema.prisma` + миграция `…_telegram_auth` | UPDATE/CREATE | `AuthProvider.telegram`; строка `AuthProviderSetting` (telegram, домены `vedamatch.com`, `localhost`); `vedamatch.com` в домены google и yandex |
| `apps/api/src/modules/auth/telegram-init-data.ts` (+spec) | CREATE | проверка подписи и срока, разбор `user` |
| `apps/api/src/modules/auth/telegram.provider.ts` (+spec) | CREATE | `TelegramUser → ProviderProfile`: служебная почта, имя, фото |
| `apps/api/src/modules/auth/auth.controller.ts`, `auth.service.ts` | UPDATE | `POST /auth/telegram/webapp { initData }` → cookie сессии |
| `portal/docker-compose.dokploy.yml` | UPDATE | `TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}` |
| `apps/mobile/src/lib/telegram/webapp.ts` (+spec) | CREATE | распознать запуск из Telegram, достать `initData`, подключить `telegram-web-app.js` только там |
| `apps/mobile/src/lib/auth/session.web.tsx`, `cookie-session.ts` | UPDATE | внутри Telegram — вход по `initData` без экрана входа |
| `apps/mobile/src/lib/telegram/telegram-shell.tsx` | CREATE | `ready()`, `expand()`, кнопка «Назад» Telegram → `router.back()`, тема, безопасные зоны |
| `apps/web` (админка способов входа), `packages/shared` | UPDATE | новое значение `telegram` в списках и подписях |
| `apps/mobile/README.md`, `docs/prds/iphone-app.prd.md` | UPDATE | раздел «Мини-приложение», статус вехи |

## Задачи

### Задача 1: провайдер `telegram` в базе
- **Действие**: миграция: `ALTER TYPE "AuthProvider" ADD VALUE 'telegram'`;
  строка настроек `telegram` (включён, домены `vedamatch.com`, `localhost`);
  `vedamatch.com` добавляется в домены `google` и `yandex`, если его там нет.
- **Образец**: миграции `…_user_identity`, `…_auth_provider_settings`.
- **Проверка**: одноразовый Postgres в Docker — `prisma migrate deploy` и
  `prisma migrate diff --exit-code`; `api.vedamatch.com/auth/providers` после
  выкладки отдаёт `google`, `yandex`, `telegram`.

### Задача 2: проверка `initData`
- **Действие**: `verifyTelegramInitData(raw, botToken, nowSec, maxAgeSec)` →
  `{ ok: true, user, authDate }` или `{ ok: false, reason }`. Отказы: нет
  `hash`/`user`/`auth_date`, неверная подпись, просрочка (по умолчанию 24 ч),
  дата из будущего, `user.is_bot`, битый JSON, слишком длинная строка.
- **Проверка**: spec с подписью, посчитанной в тесте по формуле документации;
  подмена любого поля ломает подпись; порядок полей не важен.

### Задача 3: маршрут входа
- **Действие**: `POST /auth/telegram/webapp` (троттлинг как у `dev-login`):
  `assertEnabled('telegram', host)` → проверка `initData` →
  `identities.resolve({ provider: 'telegram', externalId: String(user.id), email: tg-<id>@users.vedamatch.invalid, … }, { beforeCreate: assertRegistrationOpen })`
  → cookie сессии по контуру → `{ ok: true }`. Без токена бота — 503.
- **Проверка**: spec сервиса: верная подпись → cookie; неверная → 401;
  выключенный способ → 403; новый при закрытой регистрации → отказ.

### Задача 4: мини-приложение в веб-версии
- **Действие**: `webapp.ts` узнаёт запуск по `#tgWebAppData=` в адресе и
  только тогда подключает `https://telegram.org/js/telegram-web-app.js`
  (обычный Safari скрипт Telegram не грузит). `session.web.tsx`: внутри
  Telegram вход по `initData` сразу, экран входа не показывается; при отказе —
  обычный экран входа с текстом причины. `telegram-shell.tsx`: `ready()`,
  `expand()`, кнопка «Назад», цвета темы, `contentSafeAreaInset`.
- **Проверка**: spec `webapp.ts` (распознавание, отсутствие скрипта вне
  Telegram); локально — страница с подставленным `initData`, подписанным
  тестовым токеном.

### Задача 5: бот и выкладка
- **Действие (владелец)**: в `@BotFather` для `@vedamatch_bot` — Mini App /
  кнопка меню с адресом `https://ios.vedamatch.com`; токен бота — в
  переменную `TELEGRAM_BOT_TOKEN` стека `vedamatch-portal` (токен в чат не
  присылать).
- **Действие (я)**: переменная в compose, выкладка, проверка
  `/auth/providers`.
- **Проверка**: на iPhone и Android из `@vedamatch_bot` открывается
  мини-приложение; новый аккаунт входит одним касанием; повторный запуск — без
  входа.

### Задача 6: Telegram Desktop и Web
- **Действие**: проверить мини-приложение в Telegram Desktop и
  web.telegram.org. Там оно открывается во фрейме, и cookie
  `api.vedamatch.com` могут считаться сторонними. Если сессия не держится —
  для фрейма хранить токен только в памяти вкладки (без `localStorage`).
- **Проверка**: чаты открываются в Telegram Desktop и Web.

## Проверка

```bash
pnpm --filter @vedamatch/api test -- auth
pnpm --filter @vedamatch/api exec tsc --noEmit
pnpm --filter @vedamatch/mobile lint
pnpm --filter @vedamatch/mobile test
APP_CONTOUR=com pnpm --filter @vedamatch/mobile export:web
```

## Риски

| Риск | Вероятность | Смягчение |
|---|---|---|
| Подделка входа | низкая | проверка подписи постоянного времени, срок `auth_date`, токен бота только на сервере |
| Токен бота утечёт | низкая | только переменная Dokploy; не в репозитории, не в чате, не в логах |
| Служебная почта где-то используется как настоящая (рассылки, поиск по почте, админка) | средняя | писем портал сейчас не шлёт; в админке и поддержке показывать «почта не указана» для `.invalid` |
| Сторонние cookie во фрейме Telegram Desktop/Web | средняя | задача 6 |
| Telegram ограничат в России | средняя | в вехе 3 после входа через Telegram предлагать привязать Google/Яндекс/почту |
| Где хранить данные участника из Telegram (правило «неизвестно → ru») | открыто | не меняем правило; вопрос в PRD |

## Приёмка

- [ ] Все задачи выполнены, Android и сайт не изменились
- [ ] Проверка проходит
- [ ] На iPhone и Android из `@vedamatch_bot` вход одним касанием, чаты открываются
- [ ] Образцы повторены, не изобретены заново
