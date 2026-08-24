# Подавление пуш-уведомлений при активной переписке — дизайн

## Проблема

`ChatMessagesService.send()` (`apps/api/src/modules/chat/chat-messages.service.ts:61`)
после сохранения сообщения делает два независимых вызова:

- `this.events.publish(...)` — живая доставка по SSE всем участникам беседы.
  Именно за счёт неё сообщение появляется в открытом чате мгновенно.
- `this.notify(...)` — отдельная приватная функция (строка 436), которая по
  каждому участнику (кроме автора и тех, у кого `mutedUntil` в будущем)
  эмитит `NotificationEvent` через `EventEmitter2`. Это событие уже слушает
  портальный модуль уведомлений и превращает в пуш и запись в инбоксе.

Сейчас `notify()` не знает, смотрит ли получатель в этот момент именно в эту
беседу. Если два человека активно переписываются с открытыми окнами чата,
каждое сообщение всё равно долетает получателю ещё и пушем — хотя он его уже
видит на экране.

Наивная проверка `lastReadAt` в момент отправки не сработает: клиент отмечает
сообщение прочитанным (`markChatRead` в `chat-room.tsx`) только после того,
как получит его по SSE — это отдельный сетевой круг, который гарантированно
завершается позже, чем синхронный вызов `notify()` в том же запросе `send()`.

## Решение

Явный реестр присутствия: клиент, пока окно чата открыто и вкладка видима,
периодически сообщает бэкенду «я сейчас смотрю в беседу X». `notify()` перед
тем как эмитить уведомление конкретному участнику, проверяет реестр и
пропускает того, кто прямо сейчас там находится.

Живая доставка по SSE (`events.publish`) не меняется вообще — эта часть уже
работает правильно и не участвует в переписке ниже.

### Бэкенд: `ChatPresenceService`

Новый файл `apps/api/src/modules/chat/chat-presence.service.ts`, инжектится в
`ChatConversationsService` (запись) и `ChatMessagesService` (чтение в
`notify()`). Один явный контракт:

```ts
markViewing(userId: string, conversationId: string): Promise<void>
isViewing(userId: string, conversationId: string): Promise<boolean>
```

Хранение — тот же приём, что уже применён в `ChatEventsService`
(`apps/api/src/modules/chat/chat-events.service.ts`): если задан
`REDIS_HOST`, ключ `chat:viewing:<userId>` со значением `<conversationId>` и
TTL `PRESENCE_TTL_MS = 25_000` через `SET ... PX`; без Redis (dev) — та же
семантика на `Map<string, { conversationId: string; expiresAt: number }>`
внутри процесса, с честным предупреждением в логе при старте, как у
`ChatEventsService`. Явного «ушёл» не шлём: присутствие протухает само по
TTL. Это осознанный компромисс — после закрытия вкладки окно ложного
подавления пуша не больше ~25–35 секунд (TTL плюс интервал heartbeat), зато
не нужно распутывать несколько вкладок с одной и той же беседой или гонки
при потере сети на unmount.

### Бэкенд: точка вызова

`chat-conversations.service.ts` получает новый метод `presence()`, зеркально
`typing()` (строка 526 рядом):

```ts
async presence(userId: string, conversationId: string) {
  await this.requireConversation(conversationId, userId);
  await this.chatPresence.markViewing(userId, conversationId);
  return { ok: true };
}
```

Контроллер (`chat.controller.ts`, рядом с `typing` на строке 171) получает
новый POST-эндпоинт с тем же троттлингом, что уже стоит на `typing`:

```ts
@Post('conversations/:id/presence')
@HttpCode(200)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
presence(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
  return this.conversations.presence(user.sub, id);
}
```

`notify()` (`chat-messages.service.ts:436`) становится `async`, и в цикле по
участникам рядом с существующей проверкой `mutedUntil` добавляется вторая:

```ts
for (const member of conversation.members) {
  if (member.userId === senderId || member.leftAt) continue;
  if (member.mutedUntil && member.mutedUntil > now) continue;
  if (await this.presence.isViewing(member.userId, conversationId)) continue;
  ...
}
```

Единственная правка на месте вызова (`send()`, строка 155) —
`this.notify(...)` становится `void this.notify(...)`, поскольку функция
стала асинхронной, а `send()` по-прежнему не должна её дожидаться (как и
сейчас).

Групповые и канальные беседы работают тем же циклом без особого случая.
Первое сообщение в ещё не принятой заявке (`state === 'request'`) тоже не
требует особого случая: получатель физически не может держать открытой
беседу, в которую ещё не вошёл, значит `isViewing` для неё всегда `false`.

### Фронтенд: heartbeat

В `chat-room.tsx` уже есть готовый образец периодического сигнала —
`pingChatTyping` (`chat-client.ts:98`) с константами `TYPING_TTL_MS` /
`TYPING_PING_MS` и `useRef`-таймером. Presence-heartbeat зеркалит этот же
приём:

- Новая функция `pingChatPresence(conversationId: string): void` в
  `chat-client.ts`, один в один с `pingChatTyping`.
- В `ChatRoom` — константа `PRESENCE_PING_MS = 10_000` и `useEffect`,
  привязанный к `conversation.id`: heartbeat сразу при монтировании/смене
  беседы, затем `setInterval` на 10 секунд, пока
  `document.visibilityState === 'visible'`. Слушатель `visibilitychange`
  ставит интервал на паузу при уходе вкладки в фон и шлёт heartbeat заново
  при возврате. Явного вызова на unmount нет — TTL реестра сам всё уберёт.

Ничего не гейтится на фокус окна отдельно от видимости: активная переписка
— это открытая видимая вкладка с этим чатом, наличие фокуса ОС на других
окнах поверх браузера не должно выключать подавление пуша.

## Не входит в объём

- Подавление уже отправленных пушей (только новые сообщения после того, как
  реестр начнёт действовать).
- Явный сигнал «ушёл из беседы» на unmount/смену вкладки — TTL закрывает этот
  случай достаточно быстро без дополнительного кода.
- Изменение живой SSE-доставки (`events.publish`) — не трогается.
- Presence как публичный признак «онлайн/оффлайн» для UI — это отдельный уже
  существующий механизм (`chat-presence.tsx` / `isOnline`), с текущим не
  смешивается и не расширяется.

## Тесты

- `chat-presence.service.spec.ts` — `markViewing` + `isViewing` без Redis
  (in-memory ветка): TTL действительно истекает, разные `conversationId`
  не путаются между пользователями.
- `chat-messages.service.spec.ts` (существующий) — новый кейс: участник,
  для которого `isViewing` вернул `true`, не получает `NotificationEvent`;
  участник без presence — получает как раньше; `mutedUntil` продолжает
  работать независимо от presence.
- Фронтенд: ручная проверка через preview (два браузерных профиля/вкладки),
  так как SSE-стрим и реальный Redis не покрываются юнит-тестами `chat-room`.
