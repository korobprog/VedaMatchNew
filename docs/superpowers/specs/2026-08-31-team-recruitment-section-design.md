# Раздел «Команда» на лендинге — Design

## Context

Проекту нужны люди: разработчики, DevOps, дизайнер, но в первую очередь —
специалист по безопасности (обязательное требование заказчика). Сейчас на
лендинге нет способа заявить об открытых ролях и принять отклик — единственный
похожий механизм в портале это форма обращений в поддержку
(`apps/api/src/modules/support/`, `apps/web/src/app/support/page.tsx`):
открыта гостю без логина, шлёт заявку на бэкенд, при создании уведомляет
активных админов через событийную шину.

Кандидат заполняет форму **не залогинившись**. Push в проекте доставляется
только через `PushSubscription`, привязанную к `userId` залогиненного
`User` (`docs/superpowers/specs/2026-08-09-push-notifications-design.md`) —
подписка появляется после входа и разрешения в браузере. Анонимному кандидату
push отправить физически некуда, поэтому:

- **администратор** получает уведомление — колокольчик + push, по
  существующему пайплайну `NotificationsListener`;
- **кандидат** получает подтверждение на экране сразу после отправки формы,
  без push и без email-рассылки (транзакционной отправки почты в проекте нет
  — отдельная инфраструктура, вне рамок этой задачи).

## Роли для карточек на странице

Порядок фиксирован, security — первой, с пометкой «приоритет»:

1. Специалист по безопасности *(приоритет)*
2. Backend-разработчик (NestJS/Prisma)
3. Frontend-разработчик (Next.js/React)
4. DevOps/SRE
5. QA / test automation
6. UI/UX-дизайнер
7. Community/контент-менеджер
8. Mobile/PWA-оптимизация под Android

Список — статичный контент страницы (не отдельная таблица в БД): добавление
или правка роли — правка констант в компоненте, не миграция.

## Текст об оплате

На старте проект не платит — держится на интересе к идее. Формулировка должна
быть честной (не создавать ложных ожиданий про деньги сейчас), но не звучать
как «бесплатная работа навсегда» — упор на перспективу: с ростом проекта
появятся оплачиваемые позиции, и первыми на них рассматриваются те, кто
пришёл на этом этапе.

Блок ставится вверху страницы `/team`, перед карточками ролей, — контекст
нужен раньше, чем человек начнёт читать про конкретную роль:

> **Как это устроено сейчас.** Проект пока держится на энтузиазме и вере в
> идею — постоянных окладов сейчас нет. Но это не «поработайте бесплатно и
> прощайте»: по мере роста аудитории и монетизации сервисов появляются
> оплачиваемые позиции, и в первую очередь их предлагаем тем, кто присоединился
> на раннем этапе и внёс реальный вклад.

Короткая версия — под каждой карточкой роли, как одна строка, а не отдельный
блок:

> Сейчас — на энтузиазме, дальше — по мере роста возможна оплачиваемая позиция.

Это content-only изменение: не требует новых полей в `TeamApplication` —
текст живёт прямо в `apps/web/src/app/team/page.tsx` рядом со списком ролей.

## Архитектура: лёгкое расширение портальной инфраструктуры

Не полноценный сервисный модуль (не входит в `ADMIN_SERVICE_SLUGS`, нет своей
`service_admin`-роли) — по образцу `SupportModule`, который тоже портальная
инфраструктура, а не каталожный сервис. Модуль `apps/api/src/modules/
team-applications/`, единственная точка касания портала — одна строка в
`app.module.ts`, как того требует `docs/service-module-contract.md`.

### Данные

Блок в конце `apps/api/prisma/schema.prisma`, `// ===== Team applications
=====`, по образцу блока `SupportTicket` (`schema.prisma:1505-1531`):

```prisma
enum TeamApplicationRole {
  security
  backend
  frontend
  devops
  qa
  design
  community
  mobile
  other
}

enum TeamApplicationStatus {
  new
  reviewing
  accepted
  rejected
  closed
}

model TeamApplication {
  id              String                 @id @default(uuid())
  role            TeamApplicationRole
  /// Обязательно при role = other — свободная формулировка кандидата.
  roleOther       String?
  contactName     String?
  contactEmail    String?
  contactTelegram String?
  message         String
  portfolioUrl    String?
  userId          String?
  user            User?                  @relation(fields: [userId], references: [id], onDelete: SetNull)
  status          TeamApplicationStatus  @default(new)
  adminNote       String?
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt

  @@index([status, createdAt])
}
```

`userId` заполняется, только если кандидат случайно оказался залогинен в
момент отправки (портальная модель `User`, FK разрешён контрактом). Отдельного
`trackToken` для гостевого просмотра статуса не нужно — в отличие от
поддержки, кандидат не следит за заявкой через портал, решение сообщается
вне системы (по указанному email/telegram, вручную администратором).

### Валидация (создание)

Повторяет паттерн `support.service.ts` (`requireText`/`optionalText`/
`normalizeEmail`/`normalizeTelegram`, `apps/api/src/modules/support/
support.service.ts:569-610`) — те же вспомогательные функции дублируются
внутри нового модуля, а не импортируются из `support`, по правилу «общие
хелперы дублируются внутри модуля, а не импортируются из чужого»:

- `role` — обязателен, должен входить в `TeamApplicationRole`;
- если `role === 'other'` — `roleOther` обязателен;
- `message` — обязателен, до 4000 символов;
- нужен хотя бы один контакт: `contactEmail` **или** `contactTelegram` —
  иначе ответить будет некуда (кандидат всегда гость, `author` не бывает);
- `contactName`, `portfolioUrl` — опциональны, с ограничением длины.

### Эндпоинты

```
POST   /team/applications           OptionalAuthGuard, throttle 5/час
GET    /admin/team/applications     AuthGuard, только role === 'admin'
GET    /admin/team/applications/:id AuthGuard, только role === 'admin'
PATCH  /admin/team/applications/:id AuthGuard, только role === 'admin'
```

`ensureAdmin` — та же строгая проверка `role !== 'admin'` → `Forbidden`, что
в `support.service.ts:564-567` (не `service_admin`: у заявок в команду нет
профиля, за который отвечает сервис-админ).

### Уведомление администраторов

Копия потока `notifyAdmins` (`support.service.ts:477-502`): после создания
заявки — `void this.notifyAdmins(application.id)`, читает `User` с
`role in ['admin','service_admin']` и `accountStatus: 'active'` (read-only
портальная модель, разрешено контрактом), на каждого эмитит событие через
`EventEmitter2` в `try/catch` — ошибка уведомления не должна валить создание
заявки.

Новый вариант в `packages/shared/src/notifications.ts` (`NotificationEvent`):

```ts
| {
    /** Кандидат подал заявку в команду проекта. Уходит активным админам:
     *  без сигнала заявка лежит в очереди до случайного захода в раздел. */
    name: 'team.application.received';
    recipientId: string;
    applicationId: string;
    /** Название роли для текста уведомления — без похода в БД получателем. */
    roleLabel: string;
  }
```

`apps/api/src/modules/notifications/notification-copy.ts` — новая ветка
`case 'team.application.received'`:

```ts
case 'team.application.received':
  return {
    title: 'Новая заявка в команду',
    body: `Кандидат откликнулся: ${event.roleLabel}`,
    url: `/admin/team-applications/${event.applicationId}`,
    tag: `team-application:${event.applicationId}`,
    category: 'support',
  };
```

Категория переиспользует существующую `support` (`NotificationCategory`,
`packages/shared/src/notifications.ts:274-283`) — заводить отдельную
категорию `team` означало бы добавлять поле во все места, перечисленные в
комментарии над `NotificationPreferencesDto`
(`packages/shared/src/notifications.ts:314-323`), ради одного редкого
события. Семантически подходит: и то, и другое — «нечто, требующее внимания
администратора», и одинаково выключается общим тумблером поддержки.

## Админка

- `apps/web/src/app/admin/team-applications/page.tsx` — список заявок по
  образцу `apps/web/src/app/admin/tickets/page.tsx`: `getProfile()` →
  редирект не-админов → таблица (роль, имя, контакт, статус, дата), фильтр
  по статусу и роли, смена статуса и `adminNote` прямо из строки.
- `apps/web/src/lib/api.ts` — новые функции `getAdminTeamApplications(status?,
  role?)`, `getAdminTeamApplication(id)`, `updateTeamApplication(id, patch)`
  рядом с `getAdminSupportTickets` (`apps/web/src/lib/api.ts:156-159`), тот же
  паттерн работы с cookie `access_token`.
- `apps/web/src/lib/admin-nav.ts` — новый пункт в группе «Люди», рядом с
  «Поддержка» (`admin-nav.ts:52-57`):

  ```ts
  {
    href: "/admin/team-applications",
    label: "Заявки в команду",
    hint: "Отклики кандидатов на открытые роли",
    scope: "portal",
  },
  ```

## Лендинг

- `apps/web/src/app/team/page.tsx` — публичная страница без логина, как
  `apps/web/src/app/support/page.tsx` (рендерит `Navbar`, а не `Header`):
  интро о проекте, 8 карточек ролей, форма под ними.
- `apps/web/src/components/team/team-application-form.tsx` — client-компонент
  по образцу `apps/web/src/components/support/support-ticket-form.tsx`:
  select роли, поле `roleOther` (показывается только при `role === "other"`),
  `contactName`, `contactEmail`/`contactTelegram` (клиентская валидация «нужен
  хотя бы один», как в `support-ticket-form.tsx:~34`), `message`,
  `portfolioUrl`. `fetch` через `apiFetch` из `@/lib/http-client` на
  `${API_URL}/team/applications`, `credentials: "include"`. После успешного
  ответа форма заменяется инлайн-подтверждением «Заявка отправлена, спасибо!
  Мы свяжемся с вами по указанному контакту» — без опроса статуса, без пуша.
- `apps/web/src/components/landing/Footer.tsx` — новая ссылка «Команда» →
  `/team`, в одном ряду с `/support`, `/updates` (`Footer.tsx:33-42`).

## Тестирование

- `apps/api/src/modules/team-applications/team-applications.service.spec.ts` —
  чистая логика валидации вынесена и покрыта тестами (по правилу CLAUDE.md о
  тестировании выделенной логики даже вокруг нетестируемой обвязки):
  - `role` обязателен и должен входить в `TeamApplicationRole`;
  - `roleOther` обязателен при `role === 'other'`, иначе не требуется;
  - нужен хотя бы один контакт (email или telegram) — без него `create`
    бросает `BadRequestException`;
  - `ensureAdmin` пропускает `role === 'admin'` и отклоняет остальные.
- `apps/web/src/components/team/team-application-form.spec.tsx` (vitest,
  jsdom) — клиентская валидация «нужен хотя бы один контакт», переключение
  видимости `roleOther`, состояние успеха после отправки.

## Out of scope

- Email-подтверждение кандидату (нет транзакционной отправки почты в проекте
  — отдельная задача инфраструктуры).
- Отслеживание статуса заявки самим кандидатом (нет `trackToken`/страницы
  просмотра — решение сообщается вручную по указанному контакту).
- Публичный список открытых вакансий как отдельный сервис с собственной
  service-admin ролью — не требуется, пока это одна форма с фиксированным
  списком ролей.
