# Union P1 Connections Design

## Goal

Закрыть первый production-пакет нового Union внутри `vedamatch.ru`: дать пользователю отдельную страницу связей и заявок, показать badge новых входящих заявок в Union и общем портале, управлять видимостью профиля, исправить битую кодировку и покрыть критические backend/UI-сценарии автоматическими тестами.

## Scope

В пакет входят:

- страница `/union/connections` с вкладками «Входящие», «Исходящие», «Принятые»;
- действия принять, отклонить, открыть профиль и перейти в чат;
- badge количества входящих заявок со статусом `pending` внутри Union и на карточке Union в root portal;
- lightweight endpoint `GET /union/connection-requests/counts`;
- переключатель «Показывать профиль в рекомендациях»;
- сохранение `isActive=false` без блокировки анкеты, существующих связей и чатов;
- исправление mojibake в Union UI и пользовательских API-сообщениях;
- автоматические тесты критических сценариев Union.

В пакет не входят realtime WebSocket-обновления, email/Telegram/push-уведомления, блокировки, жалобы, модерация, избранное и личные заметки.

## Architecture

Backend сохраняет существующий endpoint полного списка `GET /union/connection-requests` и добавляет отдельный endpoint `GET /union/connection-requests/counts`, который возвращает только `{ incomingPending: number }`. Это не заставляет root portal загружать все заявки ради одного badge.

Страница `/union/connections` остаётся server-rendered. Она получает профиль портала, полный список связей и counts через server-side API helpers. Интерактивные вкладки и действия находятся в отдельном client-компоненте. После accept/decline компонент вызывает `router.refresh()`, поэтому список и badge синхронно обновляются из серверного состояния.

Принятые связи формируются объединением входящих и исходящих записей со статусом `accepted`, дедупликацией по `request.id` и сортировкой по `respondedAt ?? createdAt` от новых к старым.

## Backend Changes

### Connection Counts

`UnionConnectionService.counts(userId)` выполняет `count` по условиям:

- `toUserId = userId`;
- `status = pending`.

Контроллер публикует `GET /union/connection-requests/counts` под существующим `AuthGuard`.

Shared-контракт:

```ts
export interface UnionConnectionCounts {
  incomingPending: number;
}
```

### Profile Visibility

Поле `UnionProfile.isActive` продолжает определять участие профиля в рекомендациях. `isActive=false` не влияет на чтение собственной анкеты, список существующих связей и принятые чаты.

Frontend всегда передаёт текущее значение `isActive`. Backend не должен самопроизвольно возвращать `isActive` к `true` при обычном сохранении анкеты.

### User-Facing Errors

Все Union validation messages сохраняются как корректный UTF-8 русский текст. Контракты и HTTP status codes не меняются.

## Web Components

### Connections Page

Новая страница `/union/connections` использует общий `Header` и визуальные паттерны существующих `/union` и `/union/recommendations`.

Client-компонент отображает:

- «Входящие»: входящие заявки, включая pending/accepted/declined, с приоритетом pending сверху;
- «Исходящие»: исходящие заявки и их текущий статус;
- «Принятые»: объединённый список принятых связей;
- пустое состояние для каждой вкладки;
- карточку пользователя с именем, аватаром, городом, датой и сообщением заявки;
- accept/decline для входящих pending;
- переход в чат для accepted;
- переход к отдельной server-rendered карточке `/union/users/[id]`, использующей существующий `GET /union/users/:id` и `getUnionUserCard(id)`.

### Union Navigation

На `/union`, `/union/recommendations`, `/union/connections` и `/union/chats/[id]` доступна ссылка «Связи». Badge показывается только при `incomingPending > 0`.

Для P1 не вводится глобальный provider и polling. Badge обновляется при серверной навигации и `router.refresh()` после действий.

### Root Portal Badge

`ServiceCard` получает необязательный `badgeCount`. Root page загружает counts параллельно профилю и списку сервисов и передаёт badge только сервису с URL `/union`. Ошибка загрузки counts не ломает portal: badge скрывается, остальные сервисы продолжают отображаться.

### Profile Visibility Toggle

В `UnionProfileForm` добавляется checkbox «Показывать профиль в рекомендациях». Значение инициализируется из `profile?.isActive ?? true` и отправляется в `UnionProfileUpdateRequest`.

При выключении показывается пояснение: профиль исчезнет из рекомендаций, но существующие связи и чаты останутся доступны.

## Error Handling

- API action components блокируют повторный клик до завершения запроса.
- Ошибка accept/decline отображается рядом со списком и не сбрасывает выбранную вкладку.
- Ошибка counts обрабатывается как отсутствие badge, без ошибки всей страницы.
- Ошибка загрузки полного списка connections переводит пользователя в безопасное error state страницы, не показывая устаревшие действия.
- Пустые списки имеют отдельный текст для каждой вкладки.

## Testing

### Backend

Добавляются Jest unit tests для:

- `counts()` считает только входящие pending;
- create запрещает запрос самому себе;
- встречная pending-заявка автоматически становится accepted;
- accept/decline разрешены только получателю pending-заявки;
- chat доступен только участникам accepted connection;
- `isActive=false` исключает профиль из рекомендаций;
- сохранение анкеты не меняет `isActive` без явного значения;
- сумма intention weights обязана равняться 100;
- privacy скрывает контакты до accepted match;
- русские validation messages не содержат mojibake.

### Web

Для web component tests добавляются Vitest, `@testing-library/react`, `@testing-library/user-event` и `jsdom`, а в `apps/web/package.json` — script `test`.

Добавляются component tests для:

- переключения трёх вкладок;
- правильной группировки accepted connections;
- badge скрыт при нуле и показывает число при положительном count;
- visibility toggle отправляет `isActive=false`;
- accept/decline вызывают правильные endpoints и обновляют страницу.

### Verification

Обязательные проверки:

```bash
pnpm --filter @vedamatch/api test -- --runInBand
pnpm --filter @vedamatch/web exec tsc --noEmit
pnpm --filter @vedamatch/api exec eslint "src/modules/union/**/*.ts"
pnpm --filter @vedamatch/web exec eslint "src/app/union/**/*.{ts,tsx}" "src/components/union/**/*.{ts,tsx}"
pnpm build
```

## Sub-Agent Boundaries

Работа разделяется без пересечения файлов:

1. Connections UI agent: новые connections components/pages, Union navigation и root portal badge integration.
2. Profile/encoding agent: `UnionProfileForm`, recommendation UI copy и UTF-8 backend validation messages.
3. Backend/tests agent: counts contract/controller/service и новые Union backend tests.

Shared navigation/helper files не редактируются параллельно несколькими агентами. После завершения root agent проверяет общий diff, устраняет интеграционные несовпадения и запускает полный verification set.

## Success Criteria

- Пользователь видит входящие, исходящие и принятые связи на отдельной странице.
- Входящую pending-заявку можно принять или отклонить со страницы связей.
- После принятия доступен чат.
- Badge одинаково показывает количество входящих pending в Union и root portal.
- Отключённый профиль не попадает в рекомендации, но связи и чат работают.
- В Union UI/API нет mojibake.
- Targeted tests и production build проходят.
