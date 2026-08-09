# Push Notifications — Design

## Context

This is the second half of the PWA work. The first half
(`docs/superpowers/specs/2026-08-09-installable-pwa-design.md`, branch
`feat/installable-pwa`) made the portal installable and left a single service
worker at `apps/web/public/sw.js` scoped to `/`. That worker is the foundation
this spec builds on — one registration per device means one push subscription
per device, with no ambiguity about which worker receives a message.

Today there is no notification infrastructure at all: no subscription model, no
VAPID configuration, no sending service, and no `push` handler in the worker.

The governing constraint is `docs/service-module-contract.md`: a feature module
may import `AuthModule`, the global `PrismaService`, and shared types — and
nothing else. `UnionModule` cannot import a notifications service.

**This spec depends on `feat/installable-pwa` being merged first.** It adds
handlers to `public/sw.js`, which that branch introduces.

## Goal

Notify a user on their phone about four things, so the app stays useful when
it is closed:

| Event | Trigger site |
|---|---|
| New chat message | `union-chat.service.ts` → `sendMessage` |
| Incoming connection request | `union-connection.service.ts` → `create` |
| Connection request accepted | `union-connection.service.ts` → `accept` |
| Support replied on a ticket | `support.service.ts` |

## Decisions

| Question | Decision |
|---|---|
| How events reach the notifier | In-process event bus (`@nestjs/event-emitter`) |
| User control | Master toggle plus three categories: chat, connections, support |
| Notification content | Sender name and the beginning of the message |
| Suppress when the chat is already open | Yes, only when a visible window is on that exact chat |

### Why an event bus and not a global service

A `@Global` `PushService` injected into `UnionModule` would be less code today,
but it makes Union know about notification texts, recipients, and delivery
rules — the coupling the module contract exists to prevent. With a bus, the
touch inside a feature module is one `emit` line and no import of anything
that belongs to notifications.

An outbox table with a poller was rejected as disproportionate: it buys
"never lose a notification" at the cost of a worker, retries, and delivery
latency. For chat messages and likes, losing one on a process restart is
acceptable.

## Module boundaries

New module `apps/api/src/modules/notifications/` — portal infrastructure, not
a catalog service: it has no UI section of its own and serves every module.

Feature modules gain exactly one line each:

```ts
this.events.emit('union.chat.message-sent', payload);
```

**Events are self-contained.** The payload carries everything needed to build
the notification: recipient id, sender display name, the message body, and
the target URL. The notifications module **never queries Union or Support
tables**. It reads only `User` (allowed to every module, read-only) and its own
two models. Without this rule the contract would be violated in substance even
though no import exists.

`docs/service-module-contract.md` is amended in the same change:

- the event bus joins `PrismaService` and `AuthModule` as an allowed global;
- the self-contained-payload rule is stated, so the next person does not
  "fix" it by querying another service's tables.

### Event names and payloads

Payloads carry **facts, not copy**. The emitting service knows who did what to
whom; it does not know how that should read on a lock screen. Titles, bodies,
URLs, and grouping tags are built entirely inside the notifications module, so
all user-facing wording lives in one file and can be changed without touching
Union or Support.

```ts
// packages/shared/src/notifications.ts
export type NotificationEvent =
  | {
      name: "union.chat.message-sent";
      recipientId: string;
      senderName: string;
      body: string;
      requestId: string;
    }
  | {
      name: "union.connection.requested";
      recipientId: string;
      senderName: string;
    }
  | {
      name: "union.connection.accepted";
      recipientId: string;
      senderName: string;
      requestId: string;
    }
  | { name: "support.ticket.replied"; recipientId: string; ticketId: string };
```

The chat event carries the **full** message body; truncation to 120 characters
happens in the notifications module when the notification is composed. The
4 KB web-push payload cap is a delivery concern, not Union's.

There is a hard constraint behind this. `@vedamatch/shared` has no build step
(`main: "src/index.ts"`), so the API may import **only types** from it — types
are erased at compile time, while a value import makes Node load raw
TypeScript and the service dies at startup with `ERR_MODULE_NOT_FOUND`. Event
names are therefore string literals in the emitters, checked against the shared
union with `satisfies NotificationEvent`, and every runtime helper lives inside
`apps/api`.

The notifications module maps each event to what the browser displays, and
derives the preference category from the event name. The emitter never learns
that preference categories exist.

| Event | Title | Body | URL | Tag |
|---|---|---|---|---|
| `union.chat.message-sent` | sender name | body, truncated to 120 chars | `/union/chats/<requestId>` | `chat:<requestId>` |
| `union.connection.requested` | «Новая заявка» | «<name> хочет познакомиться» | `/union/connections` | `connections` |
| `union.connection.accepted` | «Заявка принята» | «Теперь вы можете общаться с <name>» | `/union/chats/<requestId>` | `connections` |
| `support.ticket.replied` | «Ответ поддержки» | «Поддержка ответила на ваше обращение» | `/support/<ticketId>` | `support:<ticketId>` |

Wording deliberately avoids gendered verbs: `User.gender` is optional, so
«принял(а)» would either read badly or require a fallback for every message.
Routes are the existing ones — `apps/web/src/app/union/chats/[id]`,
`union/connections`, and `support/[id]` for a signed-in user's own ticket
(`support/track/[token]` is the guest path and takes a token, not an id).

The tag makes twenty messages from one conversation collapse into a single
notification instead of stacking.

## Data model

Two models with no service prefix, consistent with `RefreshToken` and
`LoginAudit`, because this is portal infrastructure rather than a service:

```prisma
model PushSubscription {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Естественный ключ подписки: браузер выдаёт уникальный URL на устройство.
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())

  @@index([userId])
}

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

One user has several subscriptions — phone, laptop, tablet. A missing
`NotificationPreference` row means everything is enabled, so nothing has to be
written at registration; the row is created on first change.

## Configuration

Three environment variables on the API: `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` URL). Keys are generated once
with `npx web-push generate-vapid-keys` and stored like the existing secrets in
`apps/api/.env`, with placeholders added to `.env.example`.

The public key is served to the browser by `GET /notifications/vapid-key`
rather than baked in as a `NEXT_PUBLIC_` variable, so rotating it does not
require rebuilding the web app.

New dependencies: `@nestjs/event-emitter` and `web-push` in `apps/api`.

## Sending

The listener does three things: read the recipient's preferences (absent row
means everything on), load their subscriptions, send the encrypted payload to
each.

Events are published with plain `emit`, not `emitAsync` — sending a push must
not lengthen the response to sending a chat message.

**The listener must catch its own errors.** An unhandled rejection inside an
EventEmitter listener takes down the Node process, and the API falling over
because Google's push endpoint is briefly unreachable would be absurd.

### Dead subscriptions

Browsers revoke subscriptions constantly — on reinstall, on clearing site data,
after long inactivity. `web-push` throws `WebPushError` with a `statusCode`:

| Status | Meaning | Action |
|---|---|---|
| 404, 410 | Subscription no longer exists | Delete the row |
| 400 | Malformed request or keys | Delete the row |
| 429 | Rate limited | Keep the row, log, skip |
| other | Transient or unknown | Keep the row, log |

Without this cleanup the table fills with dead rows within months and every
send waits on their timeouts.

## Service worker

Three handlers are added to `apps/web/public/sw.js`:

- **`push`** — parses the payload, calls `clients.matchAll({ type: "window" })`,
  and skips `showNotification` only when a visible window is already on the
  payload's URL; in that case it `postMessage`s the client so the open
  conversation updates in place. Otherwise it shows the notification with the
  app icon and the payload's `tag`.
- **`notificationclick`** — focuses an existing window and navigates it to the
  target URL, or opens a new one when none exists.
- **`pushsubscriptionchange`** — the browser rotated the subscription;
  re-subscribe and send the new one to the server. Without this, some users
  silently stop receiving notifications one day.

### The cost of suppression

Chrome requires `userVisibleOnly: true`: every push is expected to produce a
visible notification. A site that repeatedly receives pushes without showing
anything gets Chrome's own "This site has been updated in the background"
notification instead. There is a budget for silent pushes, but it is finite.

Suppression is kept because it only triggers when the user is literally looking
at that conversation, which is rare against the total volume. If that trade
ever proves wrong, the fallback is one line: always show.

## API

| Endpoint | Purpose |
|---|---|
| `GET /notifications/vapid-key` | Public key for `pushManager.subscribe` |
| `POST /notifications/subscriptions` | Register this device |
| `DELETE /notifications/subscriptions` | Drop this device (logout, toggle off) |
| `GET /notifications/preferences` | Current toggles |
| `PATCH /notifications/preferences` | Update toggles |

All except `vapid-key` require `AuthGuard`.

## Web UI

A "Уведомления" block on the profile page: a master toggle and three
checkboxes.

Permission is requested **only from a click** on the master toggle — browsers
reject `Notification.requestPermission()` outside a user gesture, and it can be
asked once. If the user previously chose "Block", no code can bring the dialog
back; the block shows that state and explains that it can only be re-enabled in
the browser's site settings.

**On logout the device's subscription must be removed**, otherwise the next
person to sign in on a shared device receives the previous user's
notifications. This hooks into the existing cleanup block in
`apps/web/src/components/logout-button.tsx`.

### iOS

Web push arrives only in an app installed to the Home Screen, and only on
iOS 16.4 or later — it does not work in a Safari tab. The settings block must
distinguish this state and prompt the user to install the app first, reusing
the install UI from the previous branch.

## Testing

Unit tests (vitest on the web side, jest on the API side, matching each app's
existing setup) cover all decision logic with `web-push` and Prisma mocked, so
no test touches the network:

- preference gating, including the absent-row default
- recipient resolution and text construction per event type
- row deletion on 404, 410 and 400; row kept on 429
- a listener that swallows a transport failure instead of rejecting
- the web client: permission states, subscribe, and unsubscribe on logout

The service worker is not unit-tested — `public/sw.js` does not go through the
bundler, so a unit test would exercise a copy rather than the shipped file.
End-to-end tests are not honest here either: real delivery requires Google's
push service. Delivery is therefore verified by hand.

### Manual checks before release

- Android Chrome: grant permission, receive each of the four notification types
- iOS 16.4+ installed to the Home Screen: permission and delivery
- iOS in a Safari tab: the settings block explains that installation is needed
- Revoke permission in browser settings: the block reflects it and does not
  attempt to re-prompt
- Log out: the device stops receiving notifications
- Delete a subscription server-side, then send: the row is removed on 410

## Out of scope

- Email or SMS notifications
- Quiet hours and digests
- Notifications for anything beyond the four events listed above
- Read receipts or presence tracking on the server
