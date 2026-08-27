import { buildShuffleOrder, nextIndex, prevIndex } from './music-queue';
import type { QueueState } from './music-queue';

const state = (over: Partial<QueueState> = {}): QueueState => ({
  length: 3,
  index: 0,
  repeat: 'off',
  shuffle: false,
  order: null,
  ...over,
});

describe('nextIndex', () => {
  it('идёт по порядку', () => {
    expect(nextIndex(state({ index: 0 }))).toBe(1);
    expect(nextIndex(state({ index: 1 }))).toBe(2);
  });

  it('на конце без повтора останавливается', () => {
    expect(nextIndex(state({ index: 2 }))).toBeNull();
  });

  it('repeat=all с конца возвращает в начало', () => {
    expect(nextIndex(state({ index: 2, repeat: 'all' }))).toBe(0);
  });

  it('repeat=one остаётся на месте', () => {
    expect(nextIndex(state({ index: 1, repeat: 'one' }))).toBe(1);
  });

  it('пустая очередь не даёт следующего', () => {
    expect(nextIndex(state({ length: 0, index: 0 }))).toBeNull();
  });

  it('очередь из одной записи без повтора заканчивается', () => {
    expect(nextIndex(state({ length: 1, index: 0 }))).toBeNull();
  });

  it('очередь из одной записи с repeat=all играет её же', () => {
    expect(nextIndex(state({ length: 1, index: 0, repeat: 'all' }))).toBe(0);
  });
});

describe('prevIndex', () => {
  it('возвращает предыдущий', () => {
    expect(prevIndex(state({ index: 2 }))).toBe(1);
  });

  it('в начале без повтора остаётся на месте, а не проваливается', () => {
    expect(prevIndex(state({ index: 0 }))).toBeNull();
  });

  it('repeat=all из начала уводит в конец', () => {
    expect(prevIndex(state({ index: 0, repeat: 'all' }))).toBe(2);
  });

  it('repeat=one и назад оставляет на месте', () => {
    expect(prevIndex(state({ index: 1, repeat: 'one' }))).toBe(1);
  });
});

describe('buildShuffleOrder', () => {
  it('перестановка содержит все позиции ровно по разу', () => {
    const order = buildShuffleOrder(5, 42);

    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('один и тот же seed даёт один и тот же порядок', () => {
    expect(buildShuffleOrder(8, 7)).toEqual(buildShuffleOrder(8, 7));
  });

  it('разные seed дают разный порядок', () => {
    expect(buildShuffleOrder(8, 1)).not.toEqual(buildShuffleOrder(8, 2));
  });

  it('пустая и одиночная очередь не ломают перестановку', () => {
    expect(buildShuffleOrder(0, 5)).toEqual([]);
    expect(buildShuffleOrder(1, 5)).toEqual([0]);
  });

  it('нулевой seed не вырождает генератор', () => {
    // xorshift на нуле застревает в нуле навсегда — подменяем единицей.
    expect([...buildShuffleOrder(6, 0)].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
});

describe('shuffle и repeat вместе', () => {
  const order = [2, 0, 1];

  it('следующий идёт по перестановке, а не по исходному порядку', () => {
    expect(nextIndex(state({ shuffle: true, order, index: 2 }))).toBe(0);
  });

  it('конец перестановки без повтора заканчивает очередь', () => {
    expect(nextIndex(state({ shuffle: true, order, index: 1 }))).toBeNull();
  });

  it('конец перестановки с repeat=all возвращает к её началу', () => {
    expect(
      nextIndex(state({ shuffle: true, order, index: 1, repeat: 'all' })),
    ).toBe(2);
  });

  it('предыдущий тоже идёт по перестановке', () => {
    expect(prevIndex(state({ shuffle: true, order, index: 0 }))).toBe(2);
  });

  it('перестановка не той длины игнорируется — играем по порядку', () => {
    // Очередь сменили, а перестановка осталась от прежней: молча выдавать
    // чужие позиции хуже, чем временно потерять случайность.
    expect(nextIndex(state({ shuffle: true, order: [1, 0], index: 0 }))).toBe(
      1,
    );
  });

  it('позиции, которой нет в перестановке, следующего не даёт', () => {
    expect(
      nextIndex(
        state({ length: 3, shuffle: true, order: [0, 1, 2], index: 9 }),
      ),
    ).toBeNull();
  });
});
