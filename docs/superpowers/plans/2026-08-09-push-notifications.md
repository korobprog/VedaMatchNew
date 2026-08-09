# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify a user on their phone about a new chat message, an incoming connection request, an accepted request, or a support reply — delivered through the portal's existing service worker.

**Architecture:** Feature modules publish self-contained domain events on an in-process bus (`@nestjs/event-emitter`) and never learn that notifications exist. A new `notifications` module owns everything else: preference gating, subscription storage, all user-facing copy, and delivery via `web-push`, including deletion of subscriptions the browser has revoked.

**Tech Stack:** NestJS 11, Prisma, PostgreSQL, `@nestjs/event-emitter`, `web-push`, Next.js 16 App Router, jest (API), vitest + @testing-library/react (web).

**Spec:** `docs/superpowers/specs/2026-08-09-push-notifications-design.md`

## Global Constraints

- Branch `feat/push-notifications`, based on `feat/installable-pwa`. That branch introduces `apps/web/public/sw.js`, which Task 7 extends. Do not start before it exists.
- API tests: `pnpm --filter @vedamatch/api test` (jest, `rootDir: src`, `testRegex: .*\.spec\.ts$`). Services are tested by constructing them directly with hand-rolled mocks — follow `apps/api/src/modules/support/support.service.spec.ts`. Test names are Russian.
- Web tests: `pnpm --filter @vedamatch/web test` (vitest, `dir: "./src"` — every unit test lives under `apps/web/src`).
- `docs/service-module-contract.md` governs module boundaries. `union` and `support` may gain **only** an `EventEmitter2` injection and `emit` calls — no import of anything under `modules/notifications/`.
- The notifications module **must never query Union or Support tables**. It reads only `User` and its own two models. Everything else arrives in the event payload.
- All user-facing copy is Russian and lives in one file, `notification-copy.ts`. Emitters never build titles or bodies.
- Copy avoids gendered verbs: `User.gender` is optional.
- Notification URLs use existing routes: `/union/chats/<requestId>`, `/union/connections`, `/support/<ticketId>`.
- `web-push` and Prisma are mocked in every test. No test performs network I/O.

## Deviation from the spec

The spec says the worker's `pushsubscriptionchange` handler sends the new
subscription to the server. It does not: the API is a separate origin
(`api.vedamatch.ru` in production, `localhost:4000` in development) and
`public/sw.js` is a static file that never goes through the bundler, so the API
origin cannot be baked into it without a fragile build step.

Instead the worker **re-subscribes only**, and the page syncs the endpoint on
its next load — it compares the live `pushManager.getSubscription()` endpoint
against what was last sent and re-posts when they differ. This also repairs the
case where the server lost the row. The cost is that a rotated subscription
resumes on the user's next visit rather than instantly.

---

### Task 1: Shared event types and notification copy

**Files:**
- Create: `packages/shared/src/notifications.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/modules/notifications/notification-copy.ts`
- Test: `apps/api/src/modules/notifications/notification-copy.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `NotificationEvent` — discriminated union on `name`, with the four variants below.
  - `notificationEventNames` — const map of event name strings.
  - `toNotificationExcerpt(body: string): string` — trims to 120 chars.
  - `NotificationPreferencesDto`, `UpdateNotificationPreferencesRequest`, `PushSubscriptionRequest`, `VapidKeyResponse`.
  - `buildNotification(event: NotificationEvent): NotificationContent` where `NotificationContent = { title: string; body: string; url: string; tag: string; category: NotificationCategory }` and `NotificationCategory = "chat" | "connections" | "support"`.

- [ ] **Step 1: Write the shared types**

Create `packages/shared/src/notifications.ts`:

```ts
/** Событие для уведомлений. Несёт факты, а не формулировки: тексты живут
 *  в apps/api/src/modules/notifications/notification-copy.ts. */
export type NotificationEvent =
  | {
      name: 'union.chat.message-sent';
      recipientId: string;
      senderName: string;
      excerpt: string;
      requestId: string;
    }
  | {
      name: 'union.connection.requested';
      recipientId: string;
      senderName: string;
    }
  | {
      name: 'union.connection.accepted';
      recipientId: string;
      senderName: string;
      requestId: string;
    }
  | { name: 'support.ticket.replied'; recipientId: string; ticketId: string };

export const notificationEventNames = {
  chatMessageSent: 'union.chat.message-sent',
  connectionRequested: 'union.connection.requested',
  connectionAccepted: 'union.connection.accepted',
  supportReplied: 'support.ticket.replied',
} as const;

/** Payload веб-пуша ограничен ~4 КБ, да и на экране длинный текст не поместится. */
export const notificationExcerptLength = 120;

export function toNotificationExcerpt(body: string): string {
  const text = body.trim().replace(/\s+/g, ' ');
  if (text.length <= notificationExcerptLength) return text;
  return `${text.slice(0, notificationExcerptLength - 1)}…`;
}

export interface NotificationPreferencesDto {
  enabled: boolean;
  chat: boolean;
  connections: boolean;
  support: boolean;
}

export type UpdateNotificationPreferencesRequest =
  Partial<NotificationPreferencesDto>;

export interface PushSubscriptionRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeyResponse {
  publicKey: string;
}
```

- [ ] **Step 2: Re-export from the shared index**

In `packages/shared/src/index.ts`, add to the existing export block at the top:

```ts
export * from './notifications';
```

- [ ] **Step 3: Write the failing copy test**

Create `apps/api/src/modules/notifications/notification-copy.spec.ts`:

```ts
import { toNotificationExcerpt } from '@vedamatch/shared';
import { buildNotification } from './notification-copy';

describe('buildNotification', () => {
  it('показывает имя отправителя и начало сообщения', () => {
    expect(
      buildNotification({
        name: 'union.chat.message-sent',
        recipientId: 'u1',
        senderName: 'Вринда',
        excerpt: 'Харе Кришна, как ваша садхана?',
        requestId: 'r1',
      }),
    ).toEqual({
      title: 'Вринда',
      body: 'Харе Кришна, как ваша садхана?',
      url: '/union/chats/r1',
      tag: 'chat:r1',
      category: 'chat',
    });
  });

  it('схлопывает сообщения одного чата общим тегом', () => {
    const first = buildNotification({
      name: 'union.chat.message-sent',
      recipientId: 'u1',
      senderName: 'Вринда',
      excerpt: 'раз',
      requestId: 'r1',
    });
    const second = buildNotification({
      name: 'union.chat.message-sent',
      recipientId: 'u1',
      senderName: 'Вринда',
      excerpt: 'два',
      requestId: 'r1',
    });

    expect(first.tag).toBe(second.tag);
  });

  it('ведёт входящую заявку в список заявок', () => {
    expect(
      buildNotification({
        name: 'union.connection.requested',
        recipientId: 'u1',
        senderName: 'Мадхава',
      }),
    ).toEqual({
      title: 'Новая заявка',
      body: 'Мадхава хочет познакомиться',
      url: '/union/connections',
      tag: 'connections',
      category: 'connections',
    });
  });

  it('о принятой заявке пишет без указания рода', () => {
    const content = buildNotification({
      name: 'union.connection.accepted',
      recipientId: 'u1',
      senderName: 'Лалита',
      requestId: 'r7',
    });

    expect(content.body).toBe('Теперь вы можете общаться с Лалита');
    expect(content.body).not.toMatch(/\(а\)|\(а\)|ла\b/);
    expect(content.url).toBe('/union/chats/r7');
  });

  it('ведёт ответ поддержки в тикет пользователя, а не в гостевой трекер', () => {
    expect(
      buildNotification({
        name: 'support.ticket.replied',
        recipientId: 'u1',
        ticketId: 't3',
      }),
    ).toEqual({
      title: 'Ответ поддержки',
      body: 'Поддержка ответила на ваше обращение',
      url: '/support/t3',
      tag: 'support:t3',
      category: 'support',
    });
  });
});

describe('toNotificationExcerpt', () => {
  it('оставляет короткое сообщение как есть и схлопывает пробелы', () => {
    expect(toNotificationExcerpt('  Харе   Кришна  ')).toBe('Харе Кришна');
  });

  it('обрезает длинное сообщение до 120 символов с многоточием', () => {
    const excerpt = toNotificationExcerpt('я'.repeat(200));

    expect(excerpt).toHaveLength(120);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- notification-copy`
Expected: FAIL — cannot find module `./notification-copy`.

- [ ] **Step 5: Write the copy module**

Create `apps/api/src/modules/notifications/notification-copy.ts`:

```ts
import type { NotificationEvent } from '@vedamatch/shared';

export type NotificationCategory = 'chat' | 'connections' | 'support';

export interface NotificationContent {
  title: string;
  body: string;
  url: string;
  tag: string;
  category: NotificationCategory;
}

/**
 * Единственное место, где живут тексты уведомлений. Сервисы присылают факты,
 * формулировки собираются здесь — поменять копирайт можно, не трогая Union.
 * Формулировки без рода: User.gender необязателен.
 */
export function buildNotification(
  event: NotificationEvent,
): NotificationContent {
  switch (event.name) {
    case 'union.chat.message-sent':
      return {
        title: event.senderName,
        body: event.excerpt,
        url: `/union/chats/${event.requestId}`,
        tag: `chat:${event.requestId}`,
        category: 'chat',
      };
    case 'union.connection.requested':
      return {
        title: 'Новая заявка',
        body: `${event.senderName} хочет познакомиться`,
        url: '/union/connections',
        tag: 'connections',
        category: 'connections',
      };
    case 'union.connection.accepted':
      return {
        title: 'Заявка принята',
        body: `Теперь вы можете общаться с ${event.senderName}`,
        url: `/union/chats/${event.requestId}`,
        tag: 'connections',
        category: 'connections',
      };
    case 'support.ticket.replied':
      return {
        title: 'Ответ поддержки',
        body: 'Поддержка ответила на ваше обращение',
        url: `/support/${event.ticketId}`,
        tag: `support:${event.ticketId}`,
        category: 'support',
      };
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- notification-copy`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/notifications.ts packages/shared/src/index.ts apps/api/src/modules/notifications
git commit -m "feat(notifications): define push events and their copy"
```

---

### Task 2: Subscriptions and preferences

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration under `apps/api/prisma/migrations/`
- Create: `apps/api/src/modules/notifications/notifications.service.ts`
- Test: `apps/api/src/modules/notifications/notifications.service.spec.ts`
- Create: `apps/api/src/modules/notifications/notifications.controller.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `NotificationPreferencesDto`, `PushSubscriptionRequest` (Task 1).
- Produces: `NotificationsService` with
  - `saveSubscription(userId: string, dto: PushSubscriptionRequest, userAgent?: string): Promise<void>`
  - `deleteSubscription(endpoint: string): Promise<void>`
  - `listSubscriptions(userId: string): Promise<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
  - `getPreferences(userId: string): Promise<NotificationPreferencesDto>`
  - `updatePreferences(userId: string, patch: UpdateNotificationPreferencesRequest): Promise<NotificationPreferencesDto>`

- [ ] **Step 1: Add the Prisma models**

Append to `apps/api/prisma/schema.prisma`, in a new block at the end:

```prisma
// ===== Notifications (портальная инфраструктура) =====

/// Подписка браузера на веб-пуши. У одного пользователя их несколько:
/// телефон, ноутбук, планшет. Ключ подписки — endpoint, его выдаёт браузер.
model PushSubscription {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())

  @@index([userId])
}

/// Настройки уведомлений. Отсутствие строки означает «включено всё»,
/// поэтому при регистрации её создавать не нужно.
model NotificationPreference {
  userId      String   @id
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  enabled     Boolean  @default(true)
  chat        Boolean  @default(true)
  connections Boolean  @default(true)
  support     Boolean  @default(true)
  updatedAt   DateTime @updatedAt
}
```

In the `User` model, add the two back-relations next to the existing ones:

```prisma
  pushSubscriptions      PushSubscription[]
  notificationPreference NotificationPreference?
```

- [ ] **Step 2: Create and apply the migration**

Run from `apps/api`: `npx prisma migrate dev --name add_push_notifications`
Expected: a new folder under `prisma/migrations/`, and `Prisma schema loaded` followed by `Your database is now in sync with your schema.`

- [ ] **Step 3: Add the VAPID placeholders**

Append to `.env.example` in the repository root:

```
# Веб-пуши. Ключи генерируются один раз: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@vedamatch.ru
```

- [ ] **Step 4: Write the failing service test**

Create `apps/api/src/modules/notifications/notifications.service.spec.ts`:

```ts
import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';

function createService() {
  const store = {
    subscriptions: [] as Array<Record<string, unknown>>,
    preference: null as Record<string, unknown> | null,
  };
  const prisma = {
    pushSubscription: {
      upsert: jest.fn(
        ({
          create,
        }: {
          where: { endpoint: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          store.subscriptions.push(create);
          return Promise.resolve(create);
        },
      ),
      deleteMany: jest.fn(({ where }: { where: { endpoint: string } }) => {
        store.subscriptions = store.subscriptions.filter(
          (row) => row.endpoint !== where.endpoint,
        );
        return Promise.resolve({ count: 1 });
      }),
      findMany: jest.fn(() => Promise.resolve(store.subscriptions)),
    },
    notificationPreference: {
      findUnique: jest.fn(() => Promise.resolve(store.preference)),
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        store.preference = { ...create };
        return Promise.resolve(store.preference);
      }),
    },
  } as unknown as PrismaService;

  return { service: new NotificationsService(prisma), prisma, store };
}

describe('NotificationsService.saveSubscription', () => {
  it('сохраняет подписку по endpoint и переносит её на текущего пользователя', async () => {
    const { service, prisma } = createService();

    await service.saveSubscription(
      'user-1',
      {
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'p', auth: 'a' },
      },
      'Chrome',
    );

    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'https://push.example/abc' },
        update: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });
});

describe('NotificationsService.getPreferences', () => {
  it('без строки в базе считает включённым всё', async () => {
    const { service } = createService();

    await expect(service.getPreferences('user-1')).resolves.toEqual({
      enabled: true,
      chat: true,
      connections: true,
      support: true,
    });
  });

  it('возвращает сохранённые настройки', async () => {
    const { service, store } = createService();
    store.preference = {
      enabled: true,
      chat: false,
      connections: true,
      support: false,
    };

    await expect(service.getPreferences('user-1')).resolves.toEqual({
      enabled: true,
      chat: false,
      connections: true,
      support: false,
    });
  });
});

describe('NotificationsService.updatePreferences', () => {
  it('дополняет частичный патч значениями по умолчанию', async () => {
    const { service } = createService();

    await expect(
      service.updatePreferences('user-1', { chat: false }),
    ).resolves.toEqual({
      enabled: true,
      chat: false,
      connections: true,
      support: true,
    });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- notifications.service`
Expected: FAIL — cannot find module `./notifications.service`.

- [ ] **Step 6: Write the service**

Create `apps/api/src/modules/notifications/notifications.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type {
  NotificationPreferencesDto,
  PushSubscriptionRequest,
  UpdateNotificationPreferencesRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const defaults: NotificationPreferencesDto = {
  enabled: true,
  chat: true,
  connections: true,
  support: true,
};

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Один endpoint — одно устройство. Если на нём сменился аккаунт,
   *  подписка переезжает к текущему пользователю, а не дублируется. */
  async saveSubscription(
    userId: string,
    dto: PushSubscriptionRequest,
    userAgent?: string,
  ): Promise<void> {
    const data = {
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: userAgent ?? null,
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: data,
      update: data,
    });
  }

  async deleteSubscription(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async listSubscriptions(userId: string): Promise<StoredSubscription[]> {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!row) return { ...defaults };
    return {
      enabled: row.enabled,
      chat: row.chat,
      connections: row.connections,
      support: row.support,
    };
  }

  async updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferencesDto> {
    const current = await this.getPreferences(userId);
    const next: NotificationPreferencesDto = {
      enabled: patch.enabled ?? current.enabled,
      chat: patch.chat ?? current.chat,
      connections: patch.connections ?? current.connections,
      support: patch.support ?? current.support,
    };
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- notifications.service`
Expected: PASS, 4 tests.

- [ ] **Step 8: Write the controller**

Create `apps/api/src/modules/notifications/notifications.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AccessTokenPayload,
  NotificationPreferencesDto,
  PushSubscriptionRequest,
  UpdateNotificationPreferencesRequest,
  VapidKeyResponse,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** Публичный ключ отдаём эндпоинтом, а не NEXT_PUBLIC-переменной:
   *  ротация ключа не должна требовать пересборки веба. */
  @Get('vapid-key')
  vapidKey(): VapidKeyResponse {
    return { publicKey: this.config.get<string>('VAPID_PUBLIC_KEY') ?? '' };
  }

  @UseGuards(AuthGuard)
  @Post('subscriptions')
  async subscribe(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: PushSubscriptionRequest,
    @Headers('user-agent') userAgent?: string,
  ): Promise<{ ok: true }> {
    await this.notifications.saveSubscription(user.sub, body, userAgent);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Delete('subscriptions')
  async unsubscribe(
    @Body() body: { endpoint: string },
  ): Promise<{ ok: true }> {
    await this.notifications.deleteSubscription(body.endpoint);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('preferences')
  preferences(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationPreferencesDto> {
    return this.notifications.getPreferences(user.sub);
  }

  @UseGuards(AuthGuard)
  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferencesDto> {
    return this.notifications.updatePreferences(user.sub, body);
  }
}
```

`AuthGuard` and `CurrentUser` both live in `../auth/auth.guard` — verified
against `apps/api/src/modules/support/support.controller.ts:18-23`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/notifications .env.example
git commit -m "feat(notifications): store push subscriptions and preferences"
```

---

### Task 3: Sending pushes and dropping dead subscriptions

**Files:**
- Create: `apps/api/src/modules/notifications/push-errors.ts`
- Test: `apps/api/src/modules/notifications/push-errors.spec.ts`
- Create: `apps/api/src/modules/notifications/push-sender.service.ts`
- Modify: `apps/api/package.json` (add `web-push`, `@types/web-push`)

**Interfaces:**
- Consumes: `StoredSubscription` (Task 2).
- Produces:
  - `classifyPushError(statusCode: number | undefined): PushFailure` where `PushFailure = "gone" | "rate-limited" | "transient"`.
  - `PushSenderService.send(subscription: StoredSubscription, payload: object): Promise<PushFailure | null>` — resolves `null` on success, otherwise the failure class. It never rejects.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @vedamatch/api add web-push
pnpm --filter @vedamatch/api add -D @types/web-push
```

- [ ] **Step 2: Write the failing classifier test**

Create `apps/api/src/modules/notifications/push-errors.spec.ts`:

```ts
import { classifyPushError } from './push-errors';

describe('classifyPushError', () => {
  it('считает подписку мёртвой на 404 и 410', () => {
    expect(classifyPushError(404)).toBe('gone');
    expect(classifyPushError(410)).toBe('gone');
  });

  it('считает мёртвой и подписку с битыми ключами (400)', () => {
    expect(classifyPushError(400)).toBe('gone');
  });

  it('не удаляет подписку при 429 — это временный лимит', () => {
    expect(classifyPushError(429)).toBe('rate-limited');
  });

  it('всё остальное считает временным сбоем', () => {
    expect(classifyPushError(500)).toBe('transient');
    expect(classifyPushError(undefined)).toBe('transient');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- push-errors`
Expected: FAIL — cannot find module `./push-errors`.

- [ ] **Step 4: Write the classifier**

Create `apps/api/src/modules/notifications/push-errors.ts`:

```ts
export type PushFailure = 'gone' | 'rate-limited' | 'transient';

/**
 * Браузеры отзывают подписки постоянно: переустановка, очистка данных, долгое
 * бездействие. Без удаления мёртвых строк таблица зарастает, а каждая рассылка
 * ждёт по ним таймаутов.
 */
export function classifyPushError(
  statusCode: number | undefined,
): PushFailure {
  if (statusCode === 404 || statusCode === 410 || statusCode === 400) {
    return 'gone';
  }
  if (statusCode === 429) return 'rate-limited';
  return 'transient';
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- push-errors`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the sender**

Create `apps/api/src/modules/notifications/push-sender.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { classifyPushError, type PushFailure } from './push-errors';
import type { StoredSubscription } from './notifications.service';

@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT');
    this.configured = Boolean(publicKey && privateKey && subject);
    if (this.configured) {
      webpush.setVapidDetails(subject!, publicKey!, privateKey!);
    } else {
      // Локальная разработка без ключей — не повод падать при старте.
      this.logger.warn('VAPID-ключи не заданы: пуши отключены');
    }
  }

  /** Никогда не бросает: вызывающий код работает в слушателе события,
   *  где необработанное отклонение уронило бы процесс. */
  async send(
    subscription: StoredSubscription,
    payload: object,
  ): Promise<PushFailure | null> {
    if (!this.configured) return 'transient';
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
      );
      return null;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      const failure = classifyPushError(statusCode);
      this.logger.warn(
        `Пуш не доставлен (${statusCode ?? 'без кода'}): ${failure}`,
      );
      return failure;
    }
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/notifications apps/api/package.json pnpm-lock.yaml
git commit -m "feat(notifications): send web pushes and classify delivery failures"
```

---

### Task 4: The listener that ties it together

**Files:**
- Create: `apps/api/src/modules/notifications/notifications.listener.ts`
- Test: `apps/api/src/modules/notifications/notifications.listener.spec.ts`
- Create: `apps/api/src/modules/notifications/notifications.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json` (add `@nestjs/event-emitter`)

**Interfaces:**
- Consumes: `buildNotification` (Task 1), `NotificationsService` (Task 2), `PushSenderService` (Task 3).
- Produces: `NotificationsListener.deliver(event: NotificationEvent): Promise<void>` — public so tests can await it; the `@OnEvent` handlers call it without awaiting.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @vedamatch/api add @nestjs/event-emitter
```

- [ ] **Step 2: Write the failing listener test**

Create `apps/api/src/modules/notifications/notifications.listener.spec.ts`:

```ts
import { NotificationsListener } from './notifications.listener';
import type { NotificationsService } from './notifications.service';
import type { PushSenderService } from './push-sender.service';

const chatEvent = {
  name: 'union.chat.message-sent',
  recipientId: 'user-1',
  senderName: 'Вринда',
  excerpt: 'Харе Кришна',
  requestId: 'r1',
} as const;

function createListener(options: {
  preferences?: Partial<{
    enabled: boolean;
    chat: boolean;
    connections: boolean;
    support: boolean;
  }>;
  sendResult?: 'gone' | 'rate-limited' | 'transient' | null;
}) {
  const deleted: string[] = [];
  const sent: Array<{ endpoint: string; payload: unknown }> = [];
  const notifications = {
    getPreferences: jest.fn(() =>
      Promise.resolve({
        enabled: true,
        chat: true,
        connections: true,
        support: true,
        ...options.preferences,
      }),
    ),
    listSubscriptions: jest.fn(() =>
      Promise.resolve([
        { id: 's1', endpoint: 'https://push.example/a', p256dh: 'p', auth: 'a' },
      ]),
    ),
    deleteSubscription: jest.fn((endpoint: string) => {
      deleted.push(endpoint);
      return Promise.resolve();
    }),
  } as unknown as NotificationsService;
  const sender = {
    send: jest.fn((subscription: { endpoint: string }, payload: unknown) => {
      sent.push({ endpoint: subscription.endpoint, payload });
      return Promise.resolve(options.sendResult ?? null);
    }),
  } as unknown as PushSenderService;

  return {
    listener: new NotificationsListener(notifications, sender),
    notifications,
    sender,
    deleted,
    sent,
  };
}

describe('NotificationsListener.deliver', () => {
  it('отправляет пуш с текстом из notification-copy', async () => {
    const { listener, sent } = createListener({});

    await listener.deliver(chatEvent);

    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toEqual({
      title: 'Вринда',
      body: 'Харе Кришна',
      url: '/union/chats/r1',
      tag: 'chat:r1',
    });
  });

  it('молчит, когда уведомления выключены целиком', async () => {
    const { listener, sender } = createListener({
      preferences: { enabled: false },
    });

    await listener.deliver(chatEvent);

    expect(sender.send).not.toHaveBeenCalled();
  });

  it('молчит, когда выключена именно категория события', async () => {
    const { listener, sender } = createListener({
      preferences: { chat: false },
    });

    await listener.deliver(chatEvent);

    expect(sender.send).not.toHaveBeenCalled();
  });

  it('шлёт заявку, даже если чат отключён — это разные категории', async () => {
    const { listener, sender } = createListener({
      preferences: { chat: false },
    });

    await listener.deliver({
      name: 'union.connection.requested',
      recipientId: 'user-1',
      senderName: 'Мадхава',
    });

    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('удаляет подписку, которую пуш-сервис признал мёртвой', async () => {
    const { listener, deleted } = createListener({ sendResult: 'gone' });

    await listener.deliver(chatEvent);

    expect(deleted).toEqual(['https://push.example/a']);
  });

  it('сохраняет подписку при временном лимите', async () => {
    const { listener, deleted } = createListener({
      sendResult: 'rate-limited',
    });

    await listener.deliver(chatEvent);

    expect(deleted).toEqual([]);
  });

  it('не отклоняется, когда хранилище недоступно: иначе упал бы процесс', async () => {
    const { listener, notifications } = createListener({});
    jest
      .mocked(notifications.getPreferences)
      .mockRejectedValueOnce(new Error('database is down'));

    await expect(listener.deliver(chatEvent)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- notifications.listener`
Expected: FAIL — cannot find module `./notifications.listener`.

- [ ] **Step 4: Write the listener**

Create `apps/api/src/modules/notifications/notifications.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import { notificationEventNames } from '@vedamatch/shared';
import { buildNotification } from './notification-copy';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly sender: PushSenderService,
  ) {}

  @OnEvent(notificationEventNames.chatMessageSent)
  @OnEvent(notificationEventNames.connectionRequested)
  @OnEvent(notificationEventNames.connectionAccepted)
  @OnEvent(notificationEventNames.supportReplied)
  handle(event: NotificationEvent): void {
    // Без await: отправка пуша не должна удлинять ответ на исходный запрос.
    void this.deliver(event);
  }

  /**
   * Всегда резолвится. Необработанное отклонение в слушателе EventEmitter'а
   * роняет процесс, а недоступный пуш-сервис — не повод ронять API.
   */
  async deliver(event: NotificationEvent): Promise<void> {
    try {
      const content = buildNotification(event);
      const preferences = await this.notifications.getPreferences(
        event.recipientId,
      );
      if (!preferences.enabled) return;
      if (!preferences[content.category]) return;

      const subscriptions = await this.notifications.listSubscriptions(
        event.recipientId,
      );
      const payload = {
        title: content.title,
        body: content.body,
        url: content.url,
        tag: content.tag,
      };

      for (const subscription of subscriptions) {
        const failure = await this.sender.send(subscription, payload);
        if (failure === 'gone') {
          await this.notifications.deleteSubscription(subscription.endpoint);
        }
      }
    } catch (error) {
      this.logger.error(
        `Не удалось доставить уведомление ${event.name}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- notifications.listener`
Expected: PASS, 7 tests.

If stacking four `@OnEvent` decorators on one method is rejected by the
installed version, replace them with four one-line methods, each calling
`void this.deliver(event)`, and re-run.

- [ ] **Step 6: Write the module**

Create `apps/api/src/modules/notifications/notifications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushSenderService, NotificationsListener],
})
export class NotificationsModule {}
```

- [ ] **Step 7: Register the bus and the module**

In `apps/api/src/app.module.ts`, add the imports:

```ts
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsModule } from './modules/notifications/notifications.module';
```

and add both entries to the `imports` array — `EventEmitterModule.forRoot()`
directly after `ThrottlerModule.forRoot(...)`, and `NotificationsModule` at the
end of the module list.

- [ ] **Step 8: Verify the app boots**

Run from `apps/api`: `npx nest build`
Expected: build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src apps/api/package.json pnpm-lock.yaml
git commit -m "feat(notifications): deliver pushes from domain events"
```

---

### Task 5: Publish events from Union and Support

**Files:**
- Modify: `apps/api/src/modules/union/union-chat.service.ts`
- Modify: `apps/api/src/modules/union/union-connection.service.ts`
- Modify: `apps/api/src/modules/support/support.service.ts`
- Test: `apps/api/src/modules/union/union-chat.service.spec.ts` (extend)
- Modify: `docs/service-module-contract.md`

**Interfaces:**
- Consumes: `notificationEventNames`, `toNotificationExcerpt` (Task 1).
- Produces: the four events on the bus. No new exported symbols.

Feature services gain `private readonly events: EventEmitter2` in their
constructor and nothing else. `EventEmitterModule.forRoot()` registers
`EventEmitter2` globally, so no module `imports` change is needed.

- [ ] **Step 1: Amend the module contract**

In `docs/service-module-contract.md`, in the list under "Backend (`apps/api`)"
that begins "Модуль **МОЖЕТ** импортировать", add a third bullet:

```markdown
  - `EventEmitter2` из `@nestjs/event-emitter` — шина доменных событий.
```

and immediately after that list add:

```markdown
- Публикуемое событие **самодостаточно**: payload несёт всё, что нужно
  подписчику, — id получателя, отображаемое имя, отрывок текста, id для ссылки.
  Подписчик не имеет права дочитывать недостающее из таблиц чужого сервиса,
  иначе изоляция нарушена по существу, даже если формально импорта нет.
- Тексты, видимые пользователю, собирает подписчик, а не издатель: сервис
  сообщает факт, а не формулировку.
```

- [ ] **Step 2: Emit on a new chat message**

In `apps/api/src/modules/union/union-chat.service.ts`, add the imports:

```ts
import { EventEmitter2 } from '@nestjs/event-emitter';
import { notificationEventNames, toNotificationExcerpt } from '@vedamatch/shared';
```

Add `private readonly events: EventEmitter2,` as the last constructor
parameter. Then in `sendMessage`, immediately before `return {`, insert:

```ts
    // Получатель — вторая сторона связи. Имена уже загружены в
    // getAcceptedConnection, дополнительный запрос не нужен.
    const isSender = connection.fromUserId === userId;
    const recipientId = isSender ? connection.toUserId : connection.fromUserId;
    const sender = isSender ? connection.fromUser : connection.toUser;
    this.events.emit(notificationEventNames.chatMessageSent, {
      name: notificationEventNames.chatMessageSent,
      recipientId,
      senderName: sender.name,
      excerpt: toNotificationExcerpt(text),
      requestId: connection.id,
    });
```

- [ ] **Step 3: Emit on connection request and acceptance**

In `apps/api/src/modules/union/union-connection.service.ts`, add the same two
imports and the same constructor parameter.

In `create`, inside the `if (reverse?.status === 'pending')` branch, before
`return this.toRequestDto(accepted, ...)`, insert:

```ts
      // Взаимный лайк: заявка того, кто написал первым, принята.
      this.events.emit(notificationEventNames.connectionAccepted, {
        name: notificationEventNames.connectionAccepted,
        recipientId: toUserId,
        senderName: accepted.fromUser.name,
        requestId: accepted.id,
      });
```

Still in `create`, after the final `upsert` and before
`return this.toRequestDto(request, request.toUser, 'outgoing', false);`, insert:

```ts
    const author = await this.prisma.user.findUnique({
      where: { id: fromUserId },
      select: { name: true },
    });
    this.events.emit(notificationEventNames.connectionRequested, {
      name: notificationEventNames.connectionRequested,
      recipientId: toUserId,
      senderName: author?.name ?? 'Кто-то',
    });
```

In `accept`, before `return this.toRequestDto(accepted, ...)`, insert:

```ts
    const responder = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    this.events.emit(notificationEventNames.connectionAccepted, {
      name: notificationEventNames.connectionAccepted,
      recipientId: accepted.fromUserId,
      senderName: responder?.name ?? 'Собеседник',
      requestId: accepted.id,
    });
```

Reading `User.name` is explicitly allowed to every module by the contract.

- [ ] **Step 4: Emit on a support reply**

In `apps/api/src/modules/support/support.service.ts`, add:

```ts
import { EventEmitter2 } from '@nestjs/event-emitter';
import { notificationEventNames } from '@vedamatch/shared';
```

Add `private readonly events: EventEmitter2,` as the last constructor
parameter. In `adminReply`, widen the `select` to include the owner:

```ts
      select: { id: true, status: true, userId: true },
```

and after the `await this.appendMessage(...)` call, insert:

```ts
    // Гостевые обращения не имеют аккаунта, а внутренняя заметка адресована
    // администраторам, а не автору тикета.
    if (ticket.userId && body?.isInternal !== true) {
      this.events.emit(notificationEventNames.supportReplied, {
        name: notificationEventNames.supportReplied,
        recipientId: ticket.userId,
        ticketId: ticket.id,
      });
    }
```

- [ ] **Step 5: Write the failing emit test**

Append to `apps/api/src/modules/union/union-chat.service.spec.ts`:

```ts
describe('UnionChatService.sendMessage — уведомления', () => {
  function createChatService(currentUserId: string) {
    const emitted: Array<{ name: string; payload: unknown }> = [];
    const connection = {
      id: 'r1',
      status: 'accepted',
      fromUserId: 'user-1',
      toUserId: 'user-2',
      fromUser: { id: 'user-1', name: 'Арджуна', unionProfile: null },
      toUser: { id: 'user-2', name: 'Вринда', unionProfile: null },
    };
    const prisma = {
      unionConnectionRequest: {
        findUnique: jest.fn(() => Promise.resolve(connection)),
      },
      unionChatMessage: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'm1',
            requestId: data.requestId,
            fromUserId: data.fromUserId,
            body: data.body,
            createdAt: new Date('2026-08-09T10:00:00.000Z'),
          }),
        ),
      },
    };
    const events = {
      emit: jest.fn((name: string, payload: unknown) => {
        emitted.push({ name, payload });
        return true;
      }),
    };

    return { prisma, events, emitted, currentUserId };
  }

  it('публикует событие второй стороне, а не себе', async () => {
    const { prisma, events, emitted } = createChatService('user-1');
    const service = new UnionChatService(
      prisma as never,
      { resolveAvatarUrl: jest.fn() } as never,
      events as never,
    );

    await service.sendMessage('user-1', 'r1', { body: 'Харе Кришна' });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].name).toBe('union.chat.message-sent');
    expect(emitted[0].payload).toEqual({
      name: 'union.chat.message-sent',
      recipientId: 'user-2',
      senderName: 'Арджуна',
      excerpt: 'Харе Кришна',
      requestId: 'r1',
    });
  });
});
```

The existing file already constructs the service as
`new UnionChatService(prisma as unknown as PrismaService, users as never)`
(`union-chat.service.spec.ts:64`), so `events` becomes the third argument
there too — update that call site with `{ emit: jest.fn() } as never`.

- [ ] **Step 6: Run the test to verify it fails, then passes**

Run: `pnpm --filter @vedamatch/api test -- union-chat.service`
Expected before Step 2's edit is complete: FAIL, no event emitted.
Expected after: PASS.

- [ ] **Step 7: Run the whole API suite**

Run: `pnpm --filter @vedamatch/api test`
Expected: PASS. Existing Union and Support specs construct these services
directly, so each will need the extra constructor argument — add
`{ emit: jest.fn() } as never` to every such call site the failures point at.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src docs/service-module-contract.md
git commit -m "feat(notifications): publish domain events from Union and Support"
```

---

### Task 6: Service worker handlers

**Files:**
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Consumes: the payload shape `{ title, body, url, tag }` produced by Task 4.
- Produces: a `push-received` `postMessage` to a focused client; no exported symbols.

- [ ] **Step 1: Add the three handlers**

Append to `apps/web/public/sw.js`, after the existing `fetch` listener:

```js
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(showNotificationUnlessOpen(payload));
});

async function showNotificationUnlessOpen(payload) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  // Если человек прямо сейчас смотрит на этот экран, уведомление лишнее —
  // обновляем открытую страницу вместо него.
  const focused = windows.find(
    (client) =>
      client.visibilityState === "visible" &&
      new URL(client.url).pathname === payload.url,
  );
  if (focused) {
    focused.postMessage({ type: "push-received", payload });
    return;
  }
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(openTarget(url));
});

async function openTarget(url) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const existing = windows[0];
  if (existing) {
    await existing.focus();
    if ("navigate" in existing) await existing.navigate(url);
    return;
  }
  await self.clients.openWindow(url);
}

// Браузер сменил подписку. Новую на сервер отправит страница при следующей
// загрузке: адрес API сюда не зашит, sw.js не проходит через сборку.
self.addEventListener("pushsubscriptionchange", (event) => {
  const applicationServerKey =
    event.oldSubscription?.options?.applicationServerKey;
  if (!applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }),
  );
});
```

- [ ] **Step 2: Bump the shell cache version**

In the same file, change `const CACHE_NAME = \`${CACHE_PREFIX}v1\`;` to `v2`,
so returning users pick up the new worker's precache without stale entries.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/sw.js
git commit -m "feat(notifications): handle push, click and subscription change in the worker"
```

---

### Task 7: Browser subscription helpers and API client

**Files:**
- Create: `apps/web/src/lib/pwa/push-subscription.ts`
- Test: `apps/web/src/lib/pwa/push-subscription.spec.ts`
- Create: `apps/web/src/lib/notifications-api.ts`

**Interfaces:**
- Consumes: `NotificationPreferencesDto`, `PushSubscriptionRequest`, `VapidKeyResponse` (Task 1).
- Produces:
  - `urlBase64ToUint8Array(base64: string): Uint8Array`
  - `toSubscriptionRequest(subscription: PushSubscription): PushSubscriptionRequest`
  - `detectPushSupport(): "unsupported" | "denied" | "default" | "granted"`
  - `fetchVapidKey(): Promise<string>`, `saveSubscription(body)`, `removeSubscription(endpoint)`, `fetchPreferences()`, `savePreferences(patch)`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/pwa/push-subscription.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  detectPushSupport,
  toSubscriptionRequest,
  urlBase64ToUint8Array,
} from "./push-subscription";

describe("urlBase64ToUint8Array", () => {
  it("декодирует url-safe base64 без паддинга", () => {
    // "hi" в url-safe base64 — "aGk", без символа "=" на конце.
    expect(Array.from(urlBase64ToUint8Array("aGk"))).toEqual([104, 105]);
  });

  it("переводит url-safe алфавит в обычный", () => {
    const decoded = urlBase64ToUint8Array("-_8");

    expect(Array.from(decoded)).toEqual([251, 255]);
  });
});

describe("toSubscriptionRequest", () => {
  it("раскладывает подписку в форму, которую ждёт API", () => {
    const subscription = {
      endpoint: "https://push.example/a",
      toJSON: () => ({
        endpoint: "https://push.example/a",
        keys: { p256dh: "p-key", auth: "a-key" },
      }),
    } as unknown as PushSubscription;

    expect(toSubscriptionRequest(subscription)).toEqual({
      endpoint: "https://push.example/a",
      keys: { p256dh: "p-key", auth: "a-key" },
    });
  });
});

describe("detectPushSupport", () => {
  it("сообщает об отсутствии поддержки, когда нет PushManager", () => {
    vi.stubGlobal("window", {});

    expect(detectPushSupport()).toBe("unsupported");

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `npx vitest run src/lib/pwa/push-subscription.spec.ts`
Expected: FAIL — `Failed to resolve import "./push-subscription"`.

- [ ] **Step 3: Write the helpers**

Create `apps/web/src/lib/pwa/push-subscription.ts`:

```ts
import type { PushSubscriptionRequest } from "@vedamatch/shared";

export type PushSupport = "unsupported" | "denied" | "default" | "granted";

/** applicationServerKey принимает байты, а VAPID-ключ приходит строкой
 *  в url-safe base64 — со своим алфавитом и без паддинга. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

export function toSubscriptionRequest(
  subscription: PushSubscription,
): PushSubscriptionRequest {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
}

export function detectPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission as PushSupport;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `npx vitest run src/lib/pwa/push-subscription.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the API client**

Create `apps/web/src/lib/notifications-api.ts`. Unlike `lib/api.ts` this one
runs in the browser, so it uses `NEXT_PUBLIC_API_URL` and
`credentials: "include"`, matching `components/logout-button.tsx`:

```ts
// Клиентский API уведомлений: подписка создаётся в браузере, поэтому запросы
// идут с NEXT_PUBLIC_API_URL и cookie, а не через серверные хелперы lib/api.ts.
import type {
  NotificationPreferencesDto,
  PushSubscriptionRequest,
  UpdateNotificationPreferencesRequest,
  VapidKeyResponse,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchVapidKey(): Promise<string> {
  const { publicKey } = await request<VapidKeyResponse>(
    "/notifications/vapid-key",
  );
  return publicKey;
}

export function saveSubscription(body: PushSubscriptionRequest): Promise<void> {
  return request("/notifications/subscriptions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function removeSubscription(endpoint: string): Promise<void> {
  return request("/notifications/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

export function fetchPreferences(): Promise<NotificationPreferencesDto> {
  return request("/notifications/preferences");
}

export function savePreferences(
  patch: UpdateNotificationPreferencesRequest,
): Promise<NotificationPreferencesDto> {
  return request("/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(notifications): add browser subscription helpers and API client"
```

---

### Task 8: Notification settings in the profile

**Files:**
- Create: `apps/web/src/components/pwa/notification-settings.tsx`
- Test: `apps/web/src/components/pwa/notification-settings.spec.tsx`
- Modify: `apps/web/src/app/profile/page.tsx`
- Modify: `apps/web/src/components/logout-button.tsx`
- Modify: `apps/web/src/components/logout-button.spec.tsx`

**Interfaces:**
- Consumes: Task 7's helpers and client; `useInstallPrompt` from `components/pwa/use-install-prompt` (previous branch) to detect an uninstalled iOS device.
- Produces: `NotificationSettings` — no required props.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/pwa/notification-settings.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings } from "./notification-settings";
import { detectPushSupport } from "@/lib/pwa/push-subscription";
import { fetchPreferences, savePreferences } from "@/lib/notifications-api";

vi.mock("@/lib/pwa/push-subscription", () => ({
  detectPushSupport: vi.fn(),
  currentSubscription: vi.fn(async () => null),
  subscribeToPush: vi.fn(),
  toSubscriptionRequest: vi.fn(() => ({
    endpoint: "e",
    keys: { p256dh: "p", auth: "a" },
  })),
}));

vi.mock("@/lib/notifications-api", () => ({
  fetchVapidKey: vi.fn(async () => "key"),
  saveSubscription: vi.fn(async () => undefined),
  removeSubscription: vi.fn(async () => undefined),
  fetchPreferences: vi.fn(async () => ({
    enabled: true,
    chat: true,
    connections: true,
    support: true,
  })),
  savePreferences: vi.fn(async (patch) => ({
    enabled: true,
    chat: true,
    connections: true,
    support: true,
    ...patch,
  })),
}));

vi.mock("./use-install-prompt", () => ({
  useInstallPrompt: () => ({ mode: "unsupported", promptInstall: vi.fn() }),
}));

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("объясняет, что уведомления заблокированы, и не пытается спросить снова", async () => {
    vi.mocked(detectPushSupport).mockReturnValue("denied");
    render(<NotificationSettings />);

    expect(
      await screen.findByText(/разреш/i, { exact: false }),
    ).toBeInTheDocument();
    expect(fetchPreferences).not.toHaveBeenCalled();
  });

  it("показывает три категории, когда разрешение уже выдано", async () => {
    vi.mocked(detectPushSupport).mockReturnValue("granted");
    render(<NotificationSettings />);

    expect(
      await screen.findByRole("checkbox", { name: "Сообщения" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Заявки и совпадения" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Поддержка" }),
    ).toBeInTheDocument();
  });

  it("сохраняет выключенную категорию на сервере", async () => {
    vi.mocked(detectPushSupport).mockReturnValue("granted");
    render(<NotificationSettings />);

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Сообщения" }),
    );

    expect(savePreferences).toHaveBeenCalledWith({ chat: false });
  });

  it("ничего не показывает в браузере без поддержки пушей", () => {
    vi.mocked(detectPushSupport).mockReturnValue("unsupported");
    const { container } = render(<NotificationSettings />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `npx vitest run src/components/pwa/notification-settings.spec.tsx`
Expected: FAIL — `Failed to resolve import "./notification-settings"`.

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/pwa/notification-settings.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import type {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesRequest,
} from "@vedamatch/shared";
import {
  currentSubscription,
  detectPushSupport,
  subscribeToPush,
  toSubscriptionRequest,
  type PushSupport,
} from "@/lib/pwa/push-subscription";
import {
  fetchPreferences,
  fetchVapidKey,
  saveSubscription,
  savePreferences,
} from "@/lib/notifications-api";
import { useInstallPrompt } from "./use-install-prompt";

const categories = [
  { key: "chat", label: "Сообщения" },
  { key: "connections", label: "Заявки и совпадения" },
  { key: "support", label: "Поддержка" },
] as const;

export function NotificationSettings() {
  const { mode } = useInstallPrompt();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [preferences, setPreferences] =
    useState<NotificationPreferencesDto | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupport(detectPushSupport());
  }, []);

  useEffect(() => {
    if (support !== "granted") return;
    let cancelled = false;
    void fetchPreferences()
      .then((loaded) => {
        if (!cancelled) setPreferences(loaded);
      })
      .catch(() => {
        if (!cancelled) setPreferences(null);
      });
    return () => {
      cancelled = true;
    };
  }, [support]);

  // Подписка могла смениться на стороне браузера; сверяем её при каждой
  // загрузке — воркер отправить новую сам не может.
  useEffect(() => {
    if (support !== "granted") return;
    void (async () => {
      const subscription = await currentSubscription();
      if (subscription) {
        await saveSubscription(toSubscriptionRequest(subscription)).catch(
          () => undefined,
        );
      }
    })();
  }, [support]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      // Спросить можно только по жесту пользователя и только один раз.
      const permission = await Notification.requestPermission();
      setSupport(permission as PushSupport);
      if (permission !== "granted") return;
      const key = await fetchVapidKey();
      const subscription = await subscribeToPush(key);
      await saveSubscription(toSubscriptionRequest(subscription));
    } finally {
      setBusy(false);
    }
  }, []);

  const update = useCallback(
    async (patch: UpdateNotificationPreferencesRequest) => {
      const next = await savePreferences(patch);
      setPreferences(next);
    },
    [],
  );

  if (support === null || support === "unsupported") return null;

  return (
    <div className="glass rounded-2xl border border-glass-brd p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-text-0">
        <Bell className="h-5 w-5" aria-hidden="true" />
        Уведомления
      </h2>

      {mode === "ios-manual" && (
        <p className="mt-3 text-sm text-text-1">
          На iPhone уведомления приходят только в установленное приложение.
          Сначала добавьте VedaMatch на экран «Домой».
        </p>
      )}

      {support === "denied" && (
        <p className="mt-3 text-sm text-text-1">
          Вы запретили уведомления для сайта. Вернуть разрешение можно только в
          настройках браузера — из приложения спросить повторно нельзя.
        </p>
      )}

      {support === "default" && (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Включаем…" : "Включить уведомления"}
        </button>
      )}

      {support === "granted" && preferences && (
        <div className="mt-4 space-y-3">
          {categories.map((category) => (
            <label
              key={category.key}
              className="flex items-center justify-between text-sm text-text-1"
            >
              {category.label}
              <input
                type="checkbox"
                aria-label={category.label}
                checked={preferences[category.key]}
                onChange={(event) =>
                  void update({ [category.key]: event.target.checked })
                }
                className="h-5 w-5"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `npx vitest run src/components/pwa/notification-settings.spec.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mount it on the profile page**

In `apps/web/src/app/profile/page.tsx`, add the import next to `InstallButton`:

```tsx
import { NotificationSettings } from "@/components/pwa/notification-settings";
```

and render it between `<SubscriptionCard ... />` and `<ProfileEditor ... />`:

```tsx
        <div className="mb-6">
          <NotificationSettings />
        </div>
```

- [ ] **Step 6: Drop the device's subscription on logout**

In `apps/web/src/components/logout-button.tsx`, add:

```tsx
import { currentSubscription } from "@/lib/pwa/push-subscription";
import { removeSubscription } from "@/lib/notifications-api";
```

and inside `logout()`, immediately after the `if (!response.ok) throw ...` line,
insert:

```tsx
      // На общем устройстве иначе следующий вошедший получал бы чужие пуши.
      const subscription = await currentSubscription().catch(() => null);
      if (subscription) {
        await removeSubscription(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
      }
```

- [ ] **Step 7: Cover it in the logout spec**

In `apps/web/src/components/logout-button.spec.tsx`, add these mocks next to
the existing ones:

```tsx
const unsubscribe = vi.fn(async () => true);

vi.mock("@/lib/pwa/push-subscription", () => ({
  currentSubscription: vi.fn(async () => ({
    endpoint: "https://push.example/a",
    unsubscribe,
  })),
}));

vi.mock("@/lib/notifications-api", () => ({
  removeSubscription: vi.fn(async () => undefined),
}));
```

and add this test inside the existing `describe("LogoutButton", ...)`:

```tsx
  it("снимает пуш-подписку устройства при выходе", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const { removeSubscription } = await import("@/lib/notifications-api");

    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => {
      expect(removeSubscription).toHaveBeenCalledWith("https://push.example/a");
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
  });
```

- [ ] **Step 8: Run the full web suite and lint**

Run from `apps/web`: `npx vitest run`
Expected: PASS.

Run: `pnpm --filter @vedamatch/web lint`
Expected: the one pre-existing error in `theme-provider.tsx` and no new ones.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(notifications): manage notification settings from the profile"
```

---

## Manual verification before release

Push delivery cannot be tested end to end without Google's push service, so
these are checked by hand against a running API with real VAPID keys:

- [ ] Generate keys with `npx web-push generate-vapid-keys`, put them in `apps/api/.env`, restart the API.
- [ ] Android Chrome, installed app: enable notifications, then trigger each of the four events from a second account and confirm all four arrive with the right text and open the right screen.
- [ ] Open a chat, have the other account send a message: no notification appears and the conversation updates in place.
- [ ] iOS 16.4+ added to the Home Screen: permission can be granted and a notification arrives.
- [ ] iOS in a Safari tab: the settings block says the app must be installed first.
- [ ] Turn off "Сообщения" and leave the rest on: a chat message produces nothing, a new connection request still arrives.
- [ ] Revoke permission in browser settings and reload: the block explains the state and offers no button.
- [ ] Log out: the row disappears from `PushSubscription`, and the device stops receiving notifications.
- [ ] Delete a row from `PushSubscription` by hand while the browser stays subscribed, then reload the profile: the row is recreated by the sync-on-load effect.
