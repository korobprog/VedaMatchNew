# Общение: группы, привязанные к общине — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец или админ общины может завести групповую беседу (`kind: 'group'`), привязанную к общине, — не только канал, — и она сама всплывает в каталоге общины и на карте, как канал сегодня.

**Architecture:** Один общий приватный метод `requireCommunityAdmin()` в `ChatConversationsService` заменяет собой инлайновую проверку прав, которая раньше жила только в `createChannel()`; `createGroup()` начинает вызывать его же и принимать `dto.communityId`. Механизм подписки/каталога/карты не меняется — он уже общий для `group` и `channel` по `kind`/`communityId`/`visibility`.

**Tech Stack:** NestJS + Prisma (`apps/api`), Next.js клиентский компонент (`apps/web`), Jest, общий TS-тип в `packages/shared`.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-08-24-community-linked-chat-groups-design.md` — реализация обязана ей соответствовать.
- Право заводить привязанную к общине группу — то же, что у канала: активное членство в `CommunityMember` с ролью `owner` или `admin`.
- Группа с `communityId` по умолчанию `visibility: 'public'`, если явно не запрошено `private`. Группа без `communityId` — поведение не меняется (по умолчанию `private`, если явно не запрошено `public`).
- `discover()`, `map()`, `subscribe()`, `chat-access.ts` (`canWrite`/`denyJoin`) — не меняются вообще.
- Список приглашаемых при создании группы остаётся необязательным независимо от того, выбрана община или нет.

---

### Task 1: Бэкенд — `createGroup()` принимает `communityId`

**Files:**
- Modify: `apps/api/src/modules/chat/chat-conversations.service.ts:327-401` (`createGroup`, `createChannel`, новый `requireCommunityAdmin`)
- Modify: `packages/shared/src/chat.ts:240`
- Test: `apps/api/src/modules/chat/chat-conversations.service.spec.ts`

**Interfaces:**
- Produces: `ChatConversationsService.requireCommunityAdmin(userId: string, communityId: string): Promise<void>` — кидает `ForbiddenException`, если членство не найдено; ничего не возвращает при успехе. Используется обоими `createChannel()` и `createGroup()`.

- [ ] **Step 1: Написать падающие тесты**

В `apps/api/src/modules/chat/chat-conversations.service.spec.ts`, добавить новый блок `describe('createGroup')` после существующего блока `describe('createDirect')` (заканчивается на строке 218 закрывающей `});`):

```typescript
  describe('createGroup', () => {
    it('не даёт завести группу в чужой общине', async () => {
      prisma.communityMember.findFirst.mockResolvedValue(null);

      await expect(
        service.create('me', {
          kind: 'group',
          title: 'Киртан-кружок',
          communityId: 'community-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatConversation.create).not.toHaveBeenCalled();
    });

    it('админ общины заводит группу открытой и привязанной к общине', async () => {
      prisma.communityMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.chatConversation.create.mockResolvedValue(
        conversation({ communityId: 'community-1' }),
      );

      await service.create('me', {
        kind: 'group',
        title: 'Киртан-кружок',
        communityId: 'community-1',
      });

      const data = (
        (prisma.chatConversation.create.mock.calls as unknown[][])[0][0] as {
          data: { communityId: string; visibility: string };
        }
      ).data;
      expect(data.communityId).toBe('community-1');
      expect(data.visibility).toBe('public');
    });

    it('явный visibility: private перебивает открытость общины', async () => {
      prisma.communityMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.chatConversation.create.mockResolvedValue(
        conversation({ communityId: 'community-1' }),
      );

      await service.create('me', {
        kind: 'group',
        title: 'Закрытый совет',
        communityId: 'community-1',
        visibility: 'private',
      });

      const data = (
        (prisma.chatConversation.create.mock.calls as unknown[][])[0][0] as {
          data: { visibility: string };
        }
      ).data;
      expect(data.visibility).toBe('private');
    });

    it('группа без общины остаётся закрытой по умолчанию, прав не проверяет', async () => {
      prisma.chatConversation.create.mockResolvedValue(conversation());

      await service.create('me', { kind: 'group', title: 'Друзья' });

      expect(prisma.communityMember.findFirst).not.toHaveBeenCalled();
      const data = (
        (prisma.chatConversation.create.mock.calls as unknown[][])[0][0] as {
          data: { communityId: string | null; visibility: string };
        }
      ).data;
      expect(data.communityId).toBeNull();
      expect(data.visibility).toBe('private');
    });
  });
```

- [ ] **Step 2: Прогнать тесты и убедиться, что они падают**

Run: `pnpm --filter @vedamatch/api test -- chat-conversations.service`
Expected: 4 новых теста FAIL — `createGroup()` пока не читает `dto.communityId` вообще, поэтому `communityId` в записи всегда `null` (или `undefined`), а `visibility` не становится `'public'`; проверка прав тоже не выполняется, так что первый тест («не даёт завести...») тоже упадёт — исключение не выбрасывается.

- [ ] **Step 3: Вынести проверку прав в общий метод**

В `apps/api/src/modules/chat/chat-conversations.service.ts` добавить новый приватный метод сразу после `createChannel()` (перед комментарием `/** Принять запрос: диалог становится обычным. */` и методом `accept()`):

```typescript
  /**
   * Право заводить беседу общины — тот же гейт для канала и группы:
   * активная роль владельца или администратора. `Community` и
   * `CommunityMember` — портальные модели, читать их модулю разрешено.
   */
  private async requireCommunityAdmin(
    userId: string,
    communityId: string,
  ): Promise<void> {
    const membership = await this.prisma.communityMember.findFirst({
      where: {
        communityId,
        userId,
        status: 'active',
        role: { in: ['owner', 'admin'] },
      },
      select: { id: true },
    });
    if (!membership)
      throw new ForbiddenException('Беседу общины заводит администрация');
  }
```

- [ ] **Step 4: Переключить `createChannel()` на общий метод**

В том же файле заменить в `createChannel()`:

```typescript
    // Право на канал даёт роль в общине: `Community` и `CommunityMember` —
    // портальные модели, читать их модулю разрешено.
    const membership = await this.prisma.communityMember.findFirst({
      where: {
        communityId: dto.communityId,
        userId,
        status: 'active',
        role: { in: ['owner', 'admin'] },
      },
      select: { id: true },
    });
    if (!membership)
      throw new ForbiddenException('Канал заводит администрация общины');
```

на:

```typescript
    await this.requireCommunityAdmin(userId, dto.communityId);
```

- [ ] **Step 5: Реализовать `createGroup()`**

В том же файле заменить всё тело `createGroup()` на:

```typescript
  private async createGroup(
    userId: string,
    dto: CreateChatConversationRequest,
  ) {
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('У группы должно быть название');
    if (dto.communityId) await this.requireCommunityAdmin(userId, dto.communityId);

    const memberIds = await this.reachableUserIds(userId, dto.memberIds ?? []);
    const visibility = dto.communityId
      ? dto.visibility === 'private'
        ? 'private'
        : 'public'
      : dto.visibility === 'public'
        ? 'public'
        : 'private';

    const created = await this.prisma.chatConversation.create({
      data: {
        kind: 'group',
        state: 'active',
        visibility,
        title,
        description: dto.description?.trim() || null,
        communityId: dto.communityId ?? null,
        createdById: userId,
        members: {
          create: [
            { userId, role: 'owner' },
            ...memberIds.map((id) => ({ userId: id })),
          ],
        },
      },
      include: chatConversationInclude,
    });

    const summary = await this.summary(created, userId);
    this.events.publish(
      created.members.map((m) => m.userId),
      { type: 'conversation.upserted', conversation: summary },
    );
    return summary;
  }
```

- [ ] **Step 6: Уточнить комментарий в общем типе**

В `packages/shared/src/chat.ts`, строка 240, заменить:

```typescript
  /** Канал: чья община. */
  communityId?: string;
```

на:

```typescript
  /** Канал или группа: чья община. */
  communityId?: string;
```

- [ ] **Step 7: Прогнать тесты и убедиться, что все проходят**

Run: `pnpm --filter @vedamatch/api test -- chat-conversations.service`
Expected: PASS — все тесты файла, включая 4 новых и уже существующие (`createDirect`, `accept и decline`, `участники`, `закрепление`, `search`, `requireConversation`). Существующие тесты на `createChannel` (если такие есть в других файлах) тоже должны остаться зелёными — сообщение об ошибке при отсутствии прав сменилось с «Канал заводит администрация общины» на «Беседу общины заводит администрация», и это единственное текстовое отличие.

- [ ] **Step 8: Прогнать полный набор тестов api и typecheck**

Run: `pnpm --filter @vedamatch/api test`
Expected: PASS, без новых красных тестов.

Run (из `apps/api`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

Run (из `apps/web`, тип общий, web тоже его использует): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 9: Закоммитить**

```bash
git add apps/api/src/modules/chat/chat-conversations.service.ts apps/api/src/modules/chat/chat-conversations.service.spec.ts packages/shared/src/chat.ts
git commit -m "feat(chat): let community admins create community-linked groups"
```

---

### Task 2: Фронтенд — выбор общины во вкладке «Группа»

**Files:**
- Modify: `apps/web/src/components/chat/chat-new-conversation.tsx`

**Interfaces:**
- Consumes: `communityId` из Task 1 — тот же query-параметр DTO, теперь принимаемый и для `kind: "group"`.

Автотестов для `chat-new-conversation.tsx` в проекте нет (сверить: файл не
покрыт спеком) — ручная проверка через dev-сервер, как в предыдущих
UI-задачах Union.

- [ ] **Step 1: Добавить состояние для общины группы**

В `apps/web/src/components/chat/chat-new-conversation.tsx`, рядом с
существующим состоянием `communityId` (используется веткой канала —
строка `const [communityId, setCommunityId] = useState(...)`), добавить:

```tsx
  const [groupCommunityId, setGroupCommunityId] = useState("");
```

- [ ] **Step 2: Добавить выбор общины в ветку «Группа»**

В том же файле, в JSX-ветке `mode === "group"`, перед блоком
`<span className="text-xs font-medium text-text-1">Кого позвать...`,
добавить:

```tsx
          {communities.length > 0 && (
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-text-1">Община</span>
              <select
                value={groupCommunityId}
                onChange={(event) => setGroupCommunityId(event.target.value)}
                className="min-h-11 rounded-2xl border border-glass-brd bg-glass px-3 text-[15px] text-text-0 outline-none"
              >
                <option value="">Личная группа (без общины)</option>
                {communities.map(({ community }) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </select>
            </label>
          )}

```

- [ ] **Step 3: Передать `communityId` для группы при отправке**

В том же файле, в функции `create()`, заменить:

```tsx
      const conversation = await createChatConversation(
        mode === "group"
          ? { kind: "group", title: name, memberIds: selected }
          : {
              kind: "channel",
              title: name,
              description: description.trim() || undefined,
              communityId,
            },
      );
```

на:

```tsx
      const conversation = await createChatConversation(
        mode === "group"
          ? {
              kind: "group",
              title: name,
              memberIds: selected,
              communityId: groupCommunityId || undefined,
            }
          : {
              kind: "channel",
              title: name,
              description: description.trim() || undefined,
              communityId,
            },
      );
```

- [ ] **Step 4: Typecheck и линт**

Run (из `apps/web`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

Run (из `apps/web`): `pnpm exec eslint "src/components/chat/chat-new-conversation.tsx"`
Expected: без ошибок.

- [ ] **Step 5: Ручная проверка через dev-сервер**

Поднять `web` и `api` через `preview_start` (или переиспользовать уже
запущенные), залогиниться демо-аккаунтом, который админ/владелец демо-
общины «Община Москвы (демо)» (по данным сида — Говинда: владелец,
Мадхава: администратор; пароль `vedamatch`), открыть `/chat/new`.

Проверить:
- На вкладке «Группа» появляется select «Община» с опцией «Личная группа
  (без общины)» по умолчанию и «Община Москвы (демо)» в списке.
- Выбрать общину, ввести название, создать группу без выбора участников —
  беседа создаётся, ведёт в её экран.
- Открыть `/chat/discover?communityId=<id общины>` — новая группа видна
  в списке (общая логика `discover()`, уже работает без изменений).
- Открыть `/chat/map` — счётчик групп у «Община Москвы (демо)» увеличился
  на единицу.
- Залогиниться другим демо-аккаунтом, не входящим в эту общину как
  админ/владелец (например, участником) — на вкладке «Группа» select
  «Община» не должен предлагать чужую общину (список `communities` уже
  фильтруется на сервере по ролям текущего пользователя, эта часть не
  менялась).

- [ ] **Step 6: Закоммитить**

```bash
git add apps/web/src/components/chat/chat-new-conversation.tsx
git commit -m "feat(chat): pick a community when creating a group"
```
