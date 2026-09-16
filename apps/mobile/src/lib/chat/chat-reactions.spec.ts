import type { ChatMessageDto, ChatReactionSummary } from '@vedamatch/shared';
import { applyOptimisticReaction, rollbackReaction } from './chat-reactions';

describe('applyOptimisticReaction', () => {
  it('первая реакция на сообщение — новая запись со мной', () => {
    expect(applyOptimisticReaction([], '❤️')).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
  });

  it('повторный тап тем же смайликом снимает мою реакцию', () => {
    const reactions: ChatReactionSummary[] = [{ emoji: '❤️', count: 1, mine: true }];
    expect(applyOptimisticReaction(reactions, '❤️')).toEqual([]);
  });

  it('снимает мою реакцию, но оставляет чужие того же эмодзи', () => {
    const reactions: ChatReactionSummary[] = [{ emoji: '❤️', count: 2, mine: true }];
    expect(applyOptimisticReaction(reactions, '❤️')).toEqual([{ emoji: '❤️', count: 1, mine: false }]);
  });

  it('другой эмодзи заменяет мою прежнюю реакцию', () => {
    const reactions: ChatReactionSummary[] = [
      { emoji: '❤️', count: 1, mine: true },
      { emoji: '🔥', count: 3, mine: false },
    ];
    expect(applyOptimisticReaction(reactions, '🔥')).toEqual([
      { emoji: '🔥', count: 4, mine: true },
    ]);
  });

  it('новый эмодзи, которого раньше не было, добавляется отдельной записью', () => {
    const reactions: ChatReactionSummary[] = [{ emoji: '🔥', count: 1, mine: false }];
    expect(applyOptimisticReaction(reactions, '🙏')).toEqual([
      { emoji: '🔥', count: 1, mine: false },
      { emoji: '🙏', count: 1, mine: true },
    ]);
  });
});

function msg(id: string, reactions: ChatReactionSummary[]): ChatMessageDto {
  return {
    id,
    conversationId: 'c1',
    author: { id: 'other', name: 'Другой' },
    body: id,
    attachments: [],
    reactions,
    createdAt: '2026-09-14T10:00:00Z',
  } as ChatMessageDto;
}

describe('rollbackReaction', () => {
  it('патчит реакции только нужного сообщения', () => {
    const list = [msg('a', [{ emoji: '❤️', count: 1, mine: true }]), msg('b', [{ emoji: '🔥', count: 2, mine: false }])];
    const rolledBack = rollbackReaction(list, 'a', []);
    expect(rolledBack[0].reactions).toEqual([]);
    expect(rolledBack[1]).toBe(list[1]);
  });

  it('не теряет сообщения, пришедшие после снимка (новые/чужие правки)', () => {
    const before = [msg('a', [{ emoji: '❤️', count: 1, mine: true }])];
    // Пока шёл запрос, в ленту добавилось новое сообщение — снимок этого не знает.
    const arrived = [...before, msg('b', [])];
    const rolledBack = rollbackReaction(arrived, 'a', [{ emoji: '❤️', count: 2, mine: true }]);
    expect(rolledBack.map((m) => m.id)).toEqual(['a', 'b']);
    expect(rolledBack[0].reactions).toEqual([{ emoji: '❤️', count: 2, mine: true }]);
  });
});
