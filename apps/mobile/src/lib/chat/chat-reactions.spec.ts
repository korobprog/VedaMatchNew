import type { ChatReactionSummary } from '@vedamatch/shared';
import { applyOptimisticReaction } from './chat-reactions';

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
