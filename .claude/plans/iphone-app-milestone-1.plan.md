# План: VedaMatch для iPhone — веха 1 «Веб-версия на ios.vedamatch.com»

**Исходный PRD**: [docs/prds/iphone-app.prd.md](../../docs/prds/iphone-app.prd.md)
**Выбранная веха**: 1 — участник с iPhone открывает `ios.vedamatch.com`, входит
через Google или Яндекс, видит свои чаты и пишет; сессия общая с
`vedamatch.com`; версия ставится на экран «Домой»
**Сложность**: средняя
**Разведка**: ветка `spike/mobile-web` — сборка работает, план доводит её до
продакшена

## Кратко

Разведка доказала, что `apps/mobile` собирается для браузера и работает. До
продакшена не хватает трёх вещей: **входа без токенов в JS** (сессия —
httpOnly cookie на `.vedamatch.com`, её `AuthGuard` уже принимает),
**возврата после входа на поддомен** и **раздачи сборки** на
`ios.vedamatch.com` как устанавливаемого PWA. Плюс замер скорости против PWA
сайта — он решает, стоит ли вкладываться в вехи 2–7.

## Что уже есть и на что опираемся

| Факт | Где |
|---|---|
| `AuthGuard` принимает access-токен из `Authorization` **или** cookie `access_token` | `apps/api/src/modules/auth/auth.guard.ts:37-40` |
| Cookie входа ставятся на домен контура (`.vedamatch.com`), `SameSite=Lax`, refresh — `path=/auth` | `auth.service.ts` → `issueTokens`, `contour.ts` |
| CORS с `credentials: true` по списку `WEB_ORIGIN` | `apps/api/src/main.ts:7-43`, `portal/docker-compose.dokploy.yml:34` |
| Возврат после входа — только путь на `contour.webOrigin` | `auth.service.ts:75` (`safeReturnTo`), `:565` |
| Клиент приложения умеет «один refresh на все 401» через `SessionPort` | `apps/mobile/src/lib/api/client.ts` |
| Веб-подмены нативных пакетов | `spike/mobile-web`: `metro.config.js`, `web-shims/`, `*.web.ts(x)` |

## Образцы для повторения

| Категория | Источник | Образец |
|---|---|---|
| Платформенная развилка | `apps/mobile/src/lib/calls/native-call-bridge.ts:29` | `SUPPORTED = Platform.OS === ...`, вызовы под проверкой |
| Платформенные файлы | `spike/mobile-web`: `push-bridge.web.tsx`, `background-handler.web.ts` | `*.web.ts(x)` рядом с нативным, тот же экспорт |
| Защита возврата | `auth.service.ts:75` `safeReturnTo` | чистая функция + spec, всё сомнительное → безопасное значение |
| Поддомен | `apps/web/src/proxy.ts` (vaishnava, PR #150) | правило по префиксу хоста |
| Выбор контура по хосту | `auth/contour.ts` | хост сверяется со списком `WEB_ORIGIN` |
| Тесты | `apps/api/src/modules/auth/*.spec.ts`, `apps/mobile/src/**/*.spec.ts` | jest рядом с кодом, `describe/it` по-русски |

## Файлы

| Файл | Действие | Зачем |
|---|---|---|
| `apps/mobile/metro.config.js`, `web-shims/*`, `*.web.ts(x)`, `index.js`, `modules/vedamatch-calls/index.ts` | CREATE/UPDATE | перенос из разведки |
| `apps/mobile/src/lib/auth/token-store.web.ts` | UPDATE | токены в JS не хранятся — только маркер сессии |
| `apps/mobile/src/lib/auth/session.web.tsx` (или адаптер `SessionPort`) | CREATE | cookie-режим: `credentials: 'include'`, refresh — `POST /auth/refresh`, выход — `POST /auth/logout` |
| `apps/mobile/src/lib/api/client.ts` | UPDATE | опция `credentials`, без `Authorization`, когда токена нет |
| `apps/mobile/src/lib/chat/chat-stream.tsx` | UPDATE | поток событий на вебе с cookie (`withCredentials`) |
| `apps/mobile/src/lib/auth/login-flow.web.ts` | CREATE | вход — переход на `/auth/google` / `/auth/yandex` с возвратом на поддомен |
| `apps/api/src/modules/auth/auth.service.ts`, `contour.ts` (+spec) | UPDATE | разрешённый возврат на другой origin из `WEB_ORIGIN` того же контура (`returnOrigin`) |
| `apps/mobile/public/manifest.webmanifest`, иконки, service worker | CREATE | установка на экран «Домой» |
| `apps/mobile/app.config.ts` | UPDATE | блок `web`: название, цвета темы, `output: 'single'` |
| `apps/mobile/Dockerfile.web` (или стадия в существующем) | CREATE | статика + отдача `index.html` на любой путь |
| `.github/workflows/ci.yml` | UPDATE | `expo export --platform web` как проверка сборки |
| `apps/mobile/README.md` | UPDATE | раздел «Веб-версия» |

## Задачи

### Задача 1: перенести разведку и закрыть её долги
- **Действие**: перенести подмены из `spike/mobile-web`; тест на `metro.config.js`
  (на вебе подменяются ровно три пакета, на Android — ничего); скрипт
  `export:web` в `package.json`.
- **Проверка**: `pnpm --filter @vedamatch/mobile lint && pnpm --filter @vedamatch/mobile test`;
  `APP_CONTOUR=com pnpm --filter @vedamatch/mobile export:web` без ошибок.

### Задача 2: сессия на cookie
- **Действие**: на вебе `SessionPort` не хранит токены: запросы с
  `credentials: 'include'`, при 401 — `POST /auth/refresh` (cookie
  `refresh_token` на `path=/auth` уходит сама), признак «вошёл» — ответ
  `GET /users/me`. Выход — `POST /auth/logout`.
- **Образец**: `SessionPort`/`RefreshDecision` в `client.ts` — логика «один
  refresh на все 401» не меняется, меняется источник токена.
- **Проверка**: spec адаптера (401 → refresh → повтор; refresh 401 → выход;
  5xx → «недоступно», сессия цела); вход на `vedamatch.com` делает
  вошедшим и `ios.vedamatch.com`.

### Задача 3: возврат после входа на поддомен
- **Действие**: `/auth/google` и `/auth/yandex` принимают `returnOrigin`;
  сервер принимает его, только если origin входит в `WEB_ORIGIN` **того же
  контура**, иначе — `contour.webOrigin`. На проде `WEB_ORIGIN` дополняется
  `https://ios.vedamatch.com`.
- **Образец**: `safeReturnTo` и выбор контура по хосту.
- **Проверка**: spec — чужой домен, `http:` на проде, origin другого контура,
  путь в origin, пустое значение → основной портал; разрешённый → поддомен.

### Задача 4: поток событий чата на вебе
- **Действие**: убедиться, что SSE `chat-stream.tsx` на вебе идёт с cookie
  (`EventSource` c `withCredentials` или `react-native-sse` с
  `withCredentials`); переподключение после истечения access.
- **Проверка**: два браузера — сообщение из одного появляется в другом без
  перезагрузки; после 15 минут простоя поток восстанавливается.

### Задача 5: устанавливаемая версия
- **Действие**: манифест (`name`, `short_name`, `display: standalone`,
  `start_url: /`, цвета из `theme/tokens.ts`), иконки из бренд-кита
  (`generate:brand-assets`), `apple-touch-icon`, service worker кэширует
  оболочку (JS, шрифты), но не ответы API.
- **Проверка**: Lighthouse «Installable»; на iPhone «Поделиться → На экран
  Домой» открывает версию без адресной строки.

### Задача 6: раздача на ios.vedamatch.com
- **Действие**: образ со статикой (`expo export` → nginx/serve, любой путь →
  `index.html`, длинный кэш для `/_expo/static`); сервис в Dokploy с
  доменом `ios.vedamatch.com`; `WEB_ORIGIN` API дополнен поддоменом.
  Домен в Dokploy заводит владелец.
- **Проверка**: `curl -I https://ios.vedamatch.com/chat/x` → 200 и HTML;
  CORS-запрос с поддомена к `api.vedamatch.com` проходит с cookie.

### Задача 7: замер против PWA сайта (решение по вехам 2–7)
- **Действие**: на одном iPhone (SE 2020 или iPhone 11), 4G, по 5 холодных и
  повторных запусков: `ios.vedamatch.com` против PWA `vedamatch.com` — до
  списка чатов и до открытой переписки. Если веб-версия не быстрее — деление
  JS по вкладкам до перехода к вехе 2.
- **Проверка**: таблица замеров в `docs/` и строка в PRD.

## Проверка

```bash
pnpm --filter @vedamatch/mobile lint
pnpm --filter @vedamatch/mobile test
pnpm --filter @vedamatch/api test -- auth
APP_CONTOUR=com pnpm --filter @vedamatch/mobile export:web
```

Ручная приёмка на iPhone: вход через Google → список чатов → переписка →
отправка → сообщение от второго участника приходит само → «На экран Домой» →
повторный запуск без входа.

## Риски

| Риск | Вероятность | Смягчение |
|---|---|---|
| Safari ITP режет cookie между `ios.` и `api.` | низкая | один сайт `vedamatch.com`, `SameSite=Lax` — это не сторонние cookie; проверка в задаче 6 на реальном iPhone |
| Открытый редирект через `returnOrigin` | средняя | только точное совпадение со списком `WEB_ORIGIN` контура, spec на отказы |
| PWA на экране «Домой» в iOS — отдельное хранилище cookie от Safari | средняя | вход внутри установленной версии всё равно работает; проверить и описать в README |
| Веб-версия не быстрее PWA сайта | средняя | задача 7 до вех 2–7; деление JS |
| Правки в общем коде ломают Android | низкая | только `*.web.ts(x)` и подмены по платформе; тесты и сборка APK в CI |

## Приёмка

- [ ] Все задачи выполнены, Android-сборка не изменилась
- [ ] Проверка проходит
- [ ] На iPhone вход, чаты и отправка работают на `ios.vedamatch.com`
- [ ] Замер против PWA сайта записан
- [ ] Образцы повторены, не изобретены заново
