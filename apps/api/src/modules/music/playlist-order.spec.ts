import {
  POSITION_STEP,
  nextPosition,
  positionBetween,
  positionForMove,
  renumber,
} from './playlist-order';

describe('nextPosition', () => {
  it('starts a fresh playlist at one step', () => {
    expect(nextPosition(null)).toBe(POSITION_STEP);
  });

  it('appends a step past the last record', () => {
    expect(nextPosition(3000)).toBe(4000);
  });
});

describe('positionBetween', () => {
  it('lands halfway between neighbours', () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });

  it('goes a step before the first record', () => {
    expect(positionBetween(null, 1000)).toBe(0);
  });

  it('goes a step past the last one', () => {
    expect(positionBetween(4000, null)).toBe(5000);
  });

  it('opens an empty list at one step', () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
  });

  // Между 5 и 6 целого числа нет — зовущий обязан перенумеровать список.
  it('refuses when no whole number is left between neighbours', () => {
    expect(positionBetween(5, 6)).toBeNull();
    expect(positionBetween(5, 7)).toBe(6);
  });

  // Соседи в неверном порядке — ошибка зовущего, а не край списка.
  it('refuses neighbours given in the wrong order', () => {
    expect(positionBetween(2000, 1000)).toBeNull();
  });
});

describe('renumber', () => {
  it('restores the gaps and keeps the order', () => {
    expect(renumber(3)).toEqual([1000, 2000, 3000]);
  });

  it('handles an empty playlist', () => {
    expect(renumber(0)).toEqual([]);
  });
});

describe('positionForMove', () => {
  const list = [1000, 2000, 3000, 4000];

  it('moves a record to the top', () => {
    expect(positionForMove(list, 2, 0)).toBe(0);
  });

  it('moves a record to the very end', () => {
    expect(positionForMove(list, 0, 3)).toBe(5000);
  });

  // Запись, переезжающая вниз, освобождает своё место: без поправки на
  // fromIndex она встала бы на одну позицию выше показанной человеку.
  it('accounts for the gap the moved record leaves behind', () => {
    expect(positionForMove(list, 0, 1)).toBe(2500);
  });

  it('moving a record onto its own place keeps it between the same neighbours', () => {
    expect(positionForMove(list, 1, 1)).toBe(2000);
  });

  it('clamps a target index beyond the list', () => {
    expect(positionForMove(list, 0, 99)).toBe(5000);
  });

  it('asks for a renumber when the neighbours are already touching', () => {
    expect(positionForMove([1, 2, 3], 0, 1)).toBeNull();
  });
});
