import type { ChatReactionSummary } from '@vedamatch/shared';

/**
 * Локальное предсказание реакции до ответа сервера — чтобы тап отвечал
 * сразу, не дожидаясь ни `POST .../reaction`, ни потока. После ответа
 * сервера сообщение перезаписывается настоящими реакциями через
 * `applyRoomEvent` (событие `reaction.set`), на ошибке экран откатывает
 * сообщение к сохранённому снимку — снимок и откат делает вызывающий код,
 * здесь только чистое предсказание одного нового состояния.
 *
 * Правило то же, что на сервере (`chat-messages.service.ts`): тот же эмодзи
 * от меня снимает реакцию, другой — заменяет мою прежнюю.
 */
export function applyOptimisticReaction(
  reactions: readonly ChatReactionSummary[],
  emoji: string,
): ChatReactionSummary[] {
  const mine = reactions.find((reaction) => reaction.mine);

  if (mine && mine.emoji === emoji) {
    return reactions
      .map((reaction) => (reaction.emoji === emoji ? { ...reaction, count: reaction.count - 1, mine: false } : reaction))
      .filter((reaction) => reaction.count > 0);
  }

  let next = reactions;
  if (mine) {
    next = next
      .map((reaction) => (reaction.emoji === mine.emoji ? { ...reaction, count: reaction.count - 1, mine: false } : reaction))
      .filter((reaction) => reaction.count > 0);
  }

  const existing = next.find((reaction) => reaction.emoji === emoji);
  if (existing) {
    return next.map((reaction) => (reaction.emoji === emoji ? { ...reaction, count: reaction.count + 1, mine: true } : reaction));
  }
  return [...next, { emoji, count: 1, mine: true }];
}
