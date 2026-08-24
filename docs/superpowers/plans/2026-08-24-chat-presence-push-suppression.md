# Подавление пушей при активной переписке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Не слать пуш/инбокс-уведомление о новом сообщении тому, кто прямо
сейчас смотрит именно в эту беседу — по явному heartbeat-сигналу от клиента.

**Architecture:** Новый `ChatPresenceService` хранит `userId → conversationId`
с TTL 25с (Redis `SET PX`, либо `Map` в памяти процесса без Redis — тот же
приём, что уже применён в `ChatEventsService`). Клиент раз в 10с шлёт
heartbeat через новый эндпоинт `POST /chat/conversations/:id/presence`, пока
вкладка с открытой беседой видима. `ChatMessagesService.notify()` перед тем
как эмитить уведомление конкретному участнику, спрашивает у
`ChatPresenceService.isViewing()` и пропускает того, кто сейчас там. Живая
доставка по SSE (`events.publish`) не меняется.

**Tech Stack:** NestJS, ioredis (уже зависимость `chat-events.service.ts`),
Jest (api), Next.js App Router + Vitest (web, но эта фича на фронтенде без
юнит-теста — см. Task 4).

## Global Constraints

- Модуль `chat` не импортирует другие фичевые модули — вся работа только
  внутри `apps/api/src/modules/chat/`.
- TTL присутствия: `PRESENCE_TTL_MS = 25_000`.
- Интервал heartbeat на клиенте: `PRESENCE_PING_MS = 10_000`.
- Ключ в Redis: `chat:viewing:<userId>` → значение `<conversationId>`.
- Без Redis (`REDIS_HOST` не задан) — тот же функционал на `Map` в памяти
  процесса, с предупреждением в логе при старте (как у `ChatEventsService`).
- Проверка присутствия не трогает `events.publish` (живую SSE-доставку) —
  только `notify()`.

---

### Task 1: `ChatPresenceService`

**Files:**
- Create: `apps/api/src/modules/chat/chat-presence.service.ts`
- Test: `apps/api/src/modules/chat/chat-presence.service.spec.ts`

**Interfaces:**
- Produces: `class ChatPresenceService { markViewing(userId: string, conversationId: string): Promise<void>; isViewing(userId: string, conversationId: string): Promise<boolean>; }`
  — используется в Task 2 (запись) и Task 3 (чтение).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/chat/chat-presence.service.spec.ts
import { ConfigService } from '@nestjs/config';
import { ChatPresenceService } from './chat-presence.service';

/** Без REDIS_HOST сервис обязан работать на памяти процесса — тот же
 *  приём, что уже проверен для ChatEventsService в проде. */
function serviceWithoutRedis(): ChatPresenceService {
  const config = { get: () => undefined } as unknown as ConfigService;
  return new ChatPresenceService(config);
}

describe('ChatPresenceService (без Redis)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('после markViewing isViewing подтверждает ту же беседу', async () => {
    const service = serviceWithoutRedis();
    await service.markViewing('u1', 'conv-1');

    expect(await service.isViewing('u1', 'conv-1')).toBe(true);
  });

  it('другая беседа того же человека — не совпадение', async () => {
    const service = serviceWithoutRedis();
    await service.markViewing('u1', 'conv-1');

    expect(await service.isViewing('u1', 'conv-2')).toBe(false);
  });

  it('без markViewing присутствия нет', async () => {
    const service = serviceWithoutRedis();

    expect(await service.isViewing('u1', 'conv-1')).toBe(false);
  });

  it('присутствие протухает по истечении TTL', async () => {
    const service = serviceWithoutRedis();
    const start = new Date('2026-08-24T10:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(start);

    await service.markViewing('u1', 'conv-1');

    jest.spyOn(Date, 'now').mockReturnValue(start + 25_001);
    expect(await service.isViewing('u1', 'conv-1')).toBe(false);
  });

  it('разные пользователи не путаются между собой', async () => {
    const service = serviceWithoutRedis();
    await service.markViewing('u1', 'conv-1');
    await service.markViewing('u2', 'conv-2');

    expect(await service.isViewing('u1', 'conv-1')).toBe(true);
    expect(await service.isViewing('u2', 'conv-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- chat-presence.service`
Expected: FAIL — `Cannot find module './chat-presence.service'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/chat/chat-presence.service.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const KEY_PREFIX = 'chat:viewing:';
/** Дольше — дольше держится ложное подавление после закрытия вкладки;
 *  короче — чаще лишний Redis-запрос при живом heartbeat. */
export const PRESENCE_TTL_MS = 25_000;

interface LocalEntry {
  conversationId: string;
  expiresAt: number;
}

/**
 * Реестр «кто сейчас смотрит в какую беседу» для подавления пушей
 * (`ChatMessagesService.notify()`). Тот же приём хранения, что уже
 * применён в `ChatEventsService`: Redis, если он настроен, иначе честная
 * работа в пределах одного процесса.
 */
@Injectable()
export class ChatPresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPresenceService.name);
  private readonly redis: Redis | null;
  private readonly local = new Map<string, LocalEntry>();

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('REDIS_HOST');
    this.redis = host
      ? new Redis({
          host,
          port: Number(config.get('REDIS_PORT') || 6379),
          db: Number(config.get('REDIS_DB') || 0),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
      : null;
  }

  async onModuleInit() {
    if (!this.redis) {
      this.logger.warn(
        'REDIS_HOST не задан — присутствие в чате не переживает несколько инстансов',
      );
      return;
    }
    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.warn(`Redis недоступен: ${String(error)}`);
    }
  }

  async onModuleDestroy() {
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  /** Клиент подтвердил, что беседа открыта прямо сейчас. */
  async markViewing(userId: string, conversationId: string): Promise<void> {
    if (this.redis?.status === 'ready') {
      await this.redis
        .set(`${KEY_PREFIX}${userId}`, conversationId, 'PX', PRESENCE_TTL_MS)
        .catch((error) =>
          this.logger.warn(`Присутствие не записано: ${String(error)}`),
        );
      return;
    }
    this.local.set(userId, {
      conversationId,
      expiresAt: Date.now() + PRESENCE_TTL_MS,
    });
  }

  /** Смотрит ли человек именно в эту беседу прямо сейчас. */
  async isViewing(userId: string, conversationId: string): Promise<boolean> {
    if (this.redis?.status === 'ready') {
      const value = await this.redis
        .get(`${KEY_PREFIX}${userId}`)
        .catch(() => null);
      return value === conversationId;
    }
    const entry = this.local.get(userId);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.local.delete(userId);
      return false;
    }
    return entry.conversationId === conversationId;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- chat-presence.service`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat-presence.service.ts apps/api/src/modules/chat/chat-presence.service.spec.ts
git commit -m "feat(chat): реестр присутствия в беседе для подавления пушей"
```

---

### Task 2: heartbeat-эндпоинт `POST /chat/conversations/:id/presence`

**Files:**
- Modify: `apps/api/src/modules/chat/chat-conversations.service.ts:57-63` (конструктор), рядом со строкой 526 (`typing()`)
- Modify: `apps/api/src/modules/chat/chat-conversations.service.spec.ts:103-108` (конструктор в тесте)
- Modify: `apps/api/src/modules/chat/chat.controller.ts:29-59` (импорт, конструктор), рядом со строкой 171 (`typing`)
- Modify: `apps/api/src/modules/chat/chat.module.ts` (регистрация провайдера)

**Interfaces:**
- Consumes: `ChatPresenceService.markViewing(userId: string, conversationId: string): Promise<void>` (Task 1)
- Produces: `ChatConversationsService.presence(userId: string, conversationId: string): Promise<{ ok: true }>` — используется контроллером; фронтенд (Task 4) бьёт по HTTP, не по этой сигнатуре напрямую.

- [ ] **Step 1: Write the failing test**

Добавить в конец файла `apps/api/src/modules/chat/chat-conversations.service.spec.ts` (внутри существующего `describe('ChatConversationsService', ...)`, рядом с остальными `it`):

```ts
describe('presence', () => {
  it('отмечает присутствие через ChatPresenceService', async () => {
    prisma.chatConversation.findUnique.mockResolvedValue(conversation());

    await service.presence('me', 'conversation-1');

    expect(chatPresence.markViewing).toHaveBeenCalledWith(
      'me',
      'conversation-1',
    );
  });
});
```

Здесь `conversation()` и `prisma.chatConversation.findUnique` — уже существующие в этом файле хелпер и мок, которыми пользуется `requireConversation` в соседних тестах (`markRead`/`typing`); использовать их же, не заводить новые. Рядом с объявлением `const uploads = { removeMany: fn() };` (строка 101) добавить:

```ts
const chatPresence = { markViewing: fn() };
```

И передать пятым аргументом в конструктор (строки 103-108):

```ts
const service = new ChatConversationsService(
  prisma as unknown as PrismaService,
  events as unknown as ChatEventsService,
  bus as never,
  uploads as never,
  chatPresence as unknown as ChatPresenceService,
);
```

Добавить импорт вверху файла рядом с `import { ChatEventsService } from './chat-events.service';`:

```ts
import { ChatPresenceService } from './chat-presence.service';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- chat-conversations.service`
Expected: FAIL — `service.presence is not a function` (и TS-ошибка компиляции про лишний аргумент конструктора, пока Task 2 Step 3 не сделан)

- [ ] **Step 3: Write minimal implementation**

В `chat-conversations.service.ts` добавить импорт рядом со строкой 42
(`import { ChatEventsService } from './chat-events.service';`):

```ts
import { ChatPresenceService } from './chat-presence.service';
```

Конструктор (строки 58-63) — добавить пятый параметр:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly events: ChatEventsService,
  private readonly bus: EventEmitter2,
  private readonly uploads: ChatUploadsService,
  private readonly chatPresence: ChatPresenceService,
) {}
```

Новый метод — сразу после `typing()` (после строки 540, `return { ok: true };` и закрывающей `}` этого метода):

```ts
/** Heartbeat «беседа открыта прямо сейчас»: живёт в реестре присутствия,
 *  в базу не пишется — как и «печатает…» рядом. */
async presence(userId: string, conversationId: string) {
  await this.requireConversation(conversationId, userId);
  await this.chatPresence.markViewing(userId, conversationId);
  return { ok: true };
}
```

В `chat.controller.ts` добавить импорт рядом со строкой 37
(`import { ChatConversationsService } from './chat-conversations.service';`
уже есть — новый импорт не нужен, контроллер обращается к presence через
`this.conversations`). Эндпоинт — сразу после блока `typing` (после строки
176, закрывающей `}` метода `typing`):

```ts
/** Heartbeat «беседа открыта прямо сейчас» — подавляет пуш получателю,
 *  пока он реально смотрит в этот чат. Троттлинг как у «печатает…». */
@Post('conversations/:id/presence')
@HttpCode(200)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
presence(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
  return this.conversations.presence(user.sub, id);
}
```

В `chat.module.ts` добавить импорт рядом со строкой 7
(`import { ChatEventsService } from './chat-events.service';`):

```ts
import { ChatPresenceService } from './chat-presence.service';
```

И добавить `ChatPresenceService` в массив `providers` (рядом с
`ChatEventsService` на строке 47):

```ts
providers: [
  ChatConversationsService,
  ChatMessagesService,
  ChatReportsService,
  ChatEventsService,
  ChatPresenceService,
  ChatUploadsService,
  ChatSignedUrlsInterceptor,
  ChatPurgeListener,
  ChatColorTemplatesService,
  ChatConversationThemeService,
  PeopleService,
  PeopleRequestsService,
  PeopleAdminService,
  PeopleAvatarService,
],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- chat-conversations.service`
Expected: PASS

Также прогнать полный пакет тестов api, чтобы поймать поломку конструктора
в других местах, где `ChatConversationsService` мог создаваться напрямую:

Run: `pnpm --filter @vedamatch/api test`
Expected: PASS (все существующие тесты по-прежнему зелёные)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat-conversations.service.ts apps/api/src/modules/chat/chat-conversations.service.spec.ts apps/api/src/modules/chat/chat.controller.ts apps/api/src/modules/chat/chat.module.ts
git commit -m "feat(chat): эндпоинт heartbeat присутствия в беседе"
```

---

### Task 3: `notify()` пропускает того, кто сейчас смотрит в беседу

**Files:**
- Modify: `apps/api/src/modules/chat/chat-messages.service.ts:52-59` (конструктор), `:155` (вызов `notify`), `:436-473` (`notify()`)
- Modify: `apps/api/src/modules/chat/chat-messages.service.spec.ts:1-101` (импорт, мок, конструктор), `:175-194` (новый тест рядом)

**Interfaces:**
- Consumes: `ChatPresenceService.isViewing(userId: string, conversationId: string): Promise<boolean>` (Task 1)

- [ ] **Step 1: Write the failing test**

В `chat-messages.service.spec.ts` добавить импорт рядом со строкой 4
(`import { ChatEventsService } from './chat-events.service';`):

```ts
import { ChatPresenceService } from './chat-presence.service';
```

Рядом с `const bus = { emit: fn() };` (строка 94) добавить:

```ts
const chatPresence = { isViewing: fn(() => Promise.resolve(false)) };
```

Передать шестым аргументом в конструктор (строки 96-101):

```ts
const service = new ChatMessagesService(
  prisma as unknown as PrismaService,
  conversations as unknown as ChatConversationsService,
  events as unknown as ChatEventsService,
  bus as never,
  chatPresence as unknown as ChatPresenceService,
);
```

В `beforeEach` (строка 103, после `jest.clearAllMocks();`) сбросить мок на
поведение по умолчанию, иначе следующий тест унаследует настройку прошлого:

```ts
beforeEach(() => {
  jest.clearAllMocks();
  chatPresence.isViewing.mockResolvedValue(false);
  prisma.chatMessage.count.mockResolvedValue(0);
  prisma.chatMessage.create.mockResolvedValue(storedMessage());
  prisma.chatMessageReaction.findUnique.mockResolvedValue(null);
  prisma.chatMessageReaction.findMany.mockResolvedValue([]);
  conversations.requireConversation.mockResolvedValue(conversation());
});
```

Новый тест — сразу после существующего `'уведомление уходит собеседнику и
не уходит беззвучному'` (после строки 194, закрывающей этот `it`):

```ts
it('тому, кто сейчас смотрит в эту беседу, уведомление не уходит', async () => {
  chatPresence.isViewing.mockImplementation((userId: string) =>
    Promise.resolve(userId === 'other'),
  );

  await service.send('me', 'conversation-1', { body: 'привет' });

  expect(chatPresence.isViewing).toHaveBeenCalledWith(
    'other',
    'conversation-1',
  );
  expect(bus.emit).not.toHaveBeenCalled();
  // Живая доставка в открытый чат остаётся: подавляется только уведомление.
  expect(events.publish).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- chat-messages.service`
Expected: FAIL — конструктор ожидает 4 аргумента, а тест передаёт лишний
(TS-ошибка компиляции), либо (после точечного исправления типа в Step 3
интерфейса) `bus.emit` всё ещё вызывается, потому что проверка присутствия
ещё не добавлена в `notify()`.

- [ ] **Step 3: Write minimal implementation**

В `chat-messages.service.ts` добавить импорт рядом со строкой 31
(`import { ChatEventsService } from './chat-events.service';`):

```ts
import { ChatPresenceService } from './chat-presence.service';
```

Конструктор (строки 54-59) — добавить пятый параметр:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly conversations: ChatConversationsService,
  private readonly events: ChatEventsService,
  private readonly bus: EventEmitter2,
  private readonly presence: ChatPresenceService,
) {}
```

Вызов на строке 155 — `notify()` становится асинхронной, вызов помечается
`void`, чтобы `send()` по-прежнему её не дожидалась:

```ts
void this.notify(conversation, userId, body || 'Вложение', conversationId);
```

Сама `notify()` (строки 436-473) — добавить `async` и проверку присутствия
в цикле, сразу после проверки `mutedUntil`:

```ts
private async notify(
  conversation: ChatConversationRow,
  senderId: string,
  body: string,
  conversationId: string,
) {
  const sender = conversation.members.find((m) => m.userId === senderId);
  if (!sender) return;
  const senderName = resolveDisplayName(sender.user);
  const now = new Date();

  for (const member of conversation.members) {
    if (member.userId === senderId || member.leftAt) continue;
    if (member.mutedUntil && member.mutedUntil > now) continue;
    if (await this.presence.isViewing(member.userId, conversationId)) continue;

    const event: NotificationEvent =
      conversation.state === 'request'
        ? {
            name: 'chat.request-received',
            recipientId: member.userId,
            senderName,
            body,
            conversationId,
          }
        : {
            name: 'chat.message-sent',
            recipientId: member.userId,
            senderName,
            conversationTitle:
              conversation.kind === 'direct'
                ? undefined
                : (conversation.title ?? undefined),
            body,
            conversationId,
          };
    this.bus.emit(event.name, event);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- chat-messages.service`
Expected: PASS (включая новый тест и все существующие в этом файле)

Полный прогон тестов api — на случай, если `ChatMessagesService`
создаётся напрямую где-то ещё (например, в тестах модулей, которые его
импортируют):

Run: `pnpm --filter @vedamatch/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat-messages.service.ts apps/api/src/modules/chat/chat-messages.service.spec.ts
git commit -m "fix(chat): не слать пуш тому, кто сейчас смотрит в беседу"
```

---

### Task 4: heartbeat на фронтенде

**Files:**
- Modify: `apps/web/src/lib/chat-client.ts:98-103` (рядом с `pingChatTyping`)
- Modify: `apps/web/src/components/chat/chat-room.tsx:12-23` (импорт), `:34-37` (константы), `:59-62` (эффекты)

**Interfaces:**
- Consumes: ничего нового с бэкенда, кроме уже существующего HTTP-паттерна `apiFetch`/`API_URL` (`chat-client.ts:15`) и эндпоинта `POST /chat/conversations/:id/presence` из Task 2.

Юнит-теста для этой задачи нет — как и у `pingChatTyping` рядом
(`chat-client.spec.ts` не существует), а `chat-room.tsx` не покрыт
компонентными тестами на SSE-поведение. Проверка — вручную через preview
(см. Step 3).

- [ ] **Step 1: Добавить клиентскую функцию**

В `apps/web/src/lib/chat-client.ts`, сразу после `pingChatTyping` (после
строки 103, закрывающей `}` функции):

```ts
/** Heartbeat «беседа открыта прямо сейчас» — подавляет пуш получателю,
 *  пока он реально смотрит в этот чат. */
export function pingChatPresence(conversationId: string): void {
  void apiFetch(`${API_URL}/chat/conversations/${conversationId}/presence`, {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}
```

- [ ] **Step 2: Добавить heartbeat-эффект в `ChatRoom`**

В `apps/web/src/components/chat/chat-room.tsx` добавить в список импорта из
`@/lib/chat-client` (строки 12-23) `pingChatPresence` рядом с
`pingChatTyping`:

```ts
import {
  deleteChatMessage,
  editChatMessage,
  loadOlderChatMessages,
  markChatRead,
  markChatViewed,
  pinChatMessage,
  pingChatPresence,
  pingChatTyping,
  reportChat,
  sendChatMessage,
  setChatReaction,
} from "@/lib/chat-client";
```

Рядом с константами строк 34-37 добавить:

```ts
/** Раз в столько шлём «я сейчас смотрю в эту беседу», пока вкладка видима. */
const PRESENCE_PING_MS = 10_000;
```

Новый эффект — сразу после существующего mount-эффекта `markChatRead`
(после строки 62, закрывающей `}, [conversation.id]);`):

```ts
// Пока вкладка с этой беседой видима — периодический heartbeat, чтобы
// сервер не слал получателю пуш поверх сообщения, которое тот и так видит.
useEffect(() => {
  let timer: ReturnType<typeof setInterval> | null = null;

  const ping = () => pingChatPresence(conversation.id);

  const start = () => {
    if (timer) return;
    ping();
    timer = setInterval(ping, PRESENCE_PING_MS);
  };
  const stop = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") start();
    else stop();
  };

  if (document.visibilityState === "visible") start();
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}, [conversation.id]);
```

- [ ] **Step 3: Проверить вручную через preview**

Запустить дев-сервер (`preview_start` с конфигурацией `web` из
`.claude/launch.json`, либо `pnpm dev`, если предпочитаете терминал) и в
двух разных браузерных профилях/вкладках:

1. Войти под двумя разными пользователями, у которых уже есть беседа
   (или создать новую).
2. Открыть переписку у обоих одновременно.
3. Открыть вкладку Network в devtools у одного из них, отправить сообщение
   с другой стороны — убедиться, что запрос
   `POST /chat/conversations/<id>/presence` уходит примерно раз в 10 секунд,
   пока вкладка активна.
4. Свернуть вкладку получателя (или переключиться на другую) — убедиться,
   что heartbeat перестаёт уходить (`visibilitychange` сработал).
5. Отправить сообщение с другой стороны, пока получатель НЕ смотрит в
   чат (вкладка скрыта/беседа закрыта) — убедиться, что уведомление (пуш
   или запись в колокольчике) приходит как раньше.
6. Вернуть вкладку получателя на передний план в открытую беседу,
   отправить ещё одно сообщение с другой стороны — убедиться, что
   уведомление на этот раз НЕ приходит, при этом сообщение всё равно
   появляется в открытом чате живьём (SSE не сломан).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/chat-client.ts apps/web/src/components/chat/chat-room.tsx
git commit -m "feat(chat): heartbeat присутствия в открытой беседе"
```

---

## Self-Review

**Spec coverage:**
- `ChatPresenceService` (Redis + in-memory fallback, TTL 25с) — Task 1. ✅
- Эндпоинт heartbeat, зеркало `typing` — Task 2. ✅
- `notify()` пропускает присутствующего, `send()`/SSE не меняются — Task 3. ✅
- Фронтенд heartbeat по видимости вкладки — Task 4. ✅
- «Не входит в объём» (явный leave, изменение SSE, публичный online-статус)
  — сознательно не заведены отдельными задачами, план их не трогает. ✅

**Placeholder scan:** нет TBD/TODO, каждый шаг содержит готовый код или
точную команду.

**Type consistency:** `markViewing(userId, conversationId): Promise<void>` и
`isViewing(userId, conversationId): Promise<boolean>` из Task 1 использованы
с теми же именами и порядком аргументов в Task 2 и Task 3. Конструкторы
`ChatConversationsService` и `ChatMessagesService` получают `ChatPresenceService`
последним параметром в обоих случаях — совпадает с порядком мока в
соответствующих `.spec.ts`.
