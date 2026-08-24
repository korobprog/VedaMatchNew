# Общение: группы, привязанные к общине

## Проблема

Портальные общины (`Community`, `apps/api/prisma/schema.prisma` — ятры,
храмы, ашрамы и т.д.) сейчас могут завести только один тип открытой
беседы — канал (`ChatConversation.kind = 'channel'`, `communityId`
обязателен). Канал по смыслу витрина: писать в него может только
владелец/админ общины (`chat-access.ts#denyWrite`, правило
`channel_readers_do_not_write` для роли `member`). У общины нет способа
завести открытое пространство для обсуждения, где мог бы писать любой
участник, — а именно за этим человек искал, как сделать «группу ятры», и
не нашёл.

Механизм подписки уже это допускает: `ChatConversationsService.subscribe()`
и `discover()` работают одинаково для `kind: 'group'` и `kind: 'channel'`
(проверено чтением кода — фильтр `kind: {in: ['group', 'channel']}` в
`discover()`, `denyJoin()` в `chat-access.ts` не различает эти два вида).
Не хватает одного: `createGroup()` в `chat-conversations.service.ts`
принимает `dto.communityId`, но полностью его игнорирует — группа никогда
не попадает в общину.

## Область действия

Только `apps/api/src/modules/chat/chat-conversations.service.ts`,
`packages/shared/src/chat.ts` (уточнение комментария у существующего поля)
и `apps/web/src/components/chat/chat-new-conversation.tsx`. Ни
`chat-access.ts` (правила `canWrite`/`denyJoin` уже подходят как есть), ни
`discover()`/`map()`/`subscribe()` не меняются — они уже общие для группы и
канала.

## Право создавать

Та же проверка, что уже применяется к каналу: активное членство в
`CommunityMember` с ролью `owner` или `admin`. Сейчас эта проверка живёт
только внутри `createChannel()` (строки 373-383); выношу в приватный метод:

```typescript
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

`createChannel()` заменяет свою инлайновую проверку на вызов этого метода
(тот же текст ошибки был специфичен для канала — новый текст нейтральный,
подходит обеим). `createGroup()` вызывает его же, когда `dto.communityId`
передан.

## Видимость по умолчанию

Групповая беседа, привязанная к общине, по умолчанию открытая
(`visibility: 'public'`) — так же, как канал сегодня. Без общины поведение
не меняется: по умолчанию закрытая, если не запрошено явно `public`.

```typescript
const visibility = dto.communityId
  ? dto.visibility === 'private'
    ? 'private'
    : 'public'
  : dto.visibility === 'public'
    ? 'public'
    : 'private';
```

## Изменения в `createGroup()`

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

Список приглашаемых (`dto.memberIds`) остаётся необязательным и не связан
с наличием общины: можно сразу позвать знакомых, можно оставить пустым —
раз беседа публичная, остальные участники общины найдут её сами через
`discover()`/карту, как канал сегодня.

## Общий тип

`packages/shared/src/chat.ts:240` — комментарий у `communityId` в
`CreateChatConversationRequest` сейчас гласит `/** Канал: чья община. */`.
Меняется на `/** Канал или группа: чья община. */` — поле остаётся тем же,
меняется только то, что оно теперь относится к обоим видам.

## Фронтенд

`apps/web/src/components/chat/chat-new-conversation.tsx`, вкладка
«Группа» (условие рендера то же, что уже гейтит саму вкладку канала —
`communities.length > 0`, то есть человек администрирует хотя бы одну
общину):

Перед блоком «Кого позвать» добавляется:

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

Новое состояние `groupCommunityId` (аналог существующего `communityId`,
который используется веткой канала) — по умолчанию пустая строка (личная
группа). В `create()`, при `mode === "group"`, в payload добавляется
`communityId: groupCommunityId || undefined`. Видимость (`public`/`private`)
в форме не выбирается — как и у канала сегодня, решает бэкенд по наличию
`communityId`.

## Не в объёме этой задачи

- Ограничение числа групп на одну общину — не вводится (в отличие от
  канала, где по смыслу обычно один, темы обсуждений могут быть разные).
- Изменение `canWrite`/`denyJoin`/`discover`/`map`/`subscribe` — не
  требуется, эти пути уже общие для `group` и `channel`.

## Тестирование

`apps/api/src/modules/chat/chat-conversations.service.spec.ts`, новый блок
`describe('createGroup')` (по образцу уже существующего `describe('createDirect')`
в этом же файле — тот же `prisma`-мок, `conversation()`/`member()` хелперы):

- не-админ общины получает `ForbiddenException` при `communityId` чужой
  общины, `prisma.chatConversation.create` не вызывается;
- админ общины (`prisma.communityMember.findFirst` возвращает членство с
  ролью `admin`) создаёт группу — в `prisma.chatConversation.create.mock.calls`
  проверяются `data.communityId` и `data.visibility === 'public'`;
- та же группа с явным `visibility: 'private'` в запросе — сохраняет
  `private`, несмотря на `communityId`;
- группа без `communityId` — `requireCommunityAdmin`/`communityMember.findFirst`
  не вызывается вовсе, `data.visibility === 'private'` по умолчанию (текущее
  поведение, регрессионная защита).

Ручной проверки через dev-сервер для фронтенда: создать группу с выбранной
общиной под dev-аккаунтом, который в ней админ/владелец (демо-сид
`Община Москвы (демо)`), убедиться, что группа появляется в
`/chat/discover?communityId=...` и на `/chat/map` в счётчике групп общины.
