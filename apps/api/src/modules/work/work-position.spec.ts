import {
  WORK_POSITION_STEP,
  needsRebalance,
  positionBetween,
  rebalancedPositions,
  resolveMovePosition,
} from './work-position';

describe('positionBetween', () => {
  it('пустая колонка — нулевая позиция', () => {
    expect(positionBetween(null, null)).toBe(0);
  });

  it('в конец — шаг после последней', () => {
    expect(positionBetween(100, null)).toBe(100 + WORK_POSITION_STEP);
  });

  it('в начало — шаг до первой', () => {
    expect(positionBetween(null, 100)).toBe(100 - WORK_POSITION_STEP);
  });

  it('между соседями — середина', () => {
    expect(positionBetween(0, 1024)).toBe(512);
  });

  it('порядок сохраняется после вставки', () => {
    const middle = positionBetween(0, 1024);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1024);
  });
});

describe('needsRebalance', () => {
  it('обычный зазор перенумерации не требует', () => {
    expect(needsRebalance(0, 1024)).toBe(false);
  });

  it('схлопнувшийся зазор требует', () => {
    expect(needsRebalance(1, 1 + 1e-9)).toBe(true);
  });

  it('край колонки перенумерации не требует: места там бесконечно', () => {
    expect(needsRebalance(null, 0)).toBe(false);
    expect(needsRebalance(0, null)).toBe(false);
  });

  it('полсотни вставок в одно место действительно схлопывают зазор', () => {
    let before = 0;
    const after = WORK_POSITION_STEP;
    let steps = 0;
    while (!needsRebalance(before, after) && steps < 200) {
      before = positionBetween(before, after);
      steps += 1;
    }
    expect(needsRebalance(before, after)).toBe(true);
    // Ради этого числа и живёт перенумерация: без неё доска ломается молча.
    expect(steps).toBeLessThan(60);
  });
});

describe('rebalancedPositions', () => {
  it('раскладывает ровным шагом', () => {
    expect(rebalancedPositions(3)).toEqual([0, 1024, 2048]);
  });

  it('пустая колонка — пустой список', () => {
    expect(rebalancedPositions(0)).toEqual([]);
  });
});

describe('resolveMovePosition', () => {
  const column = [
    { id: 'a', position: 0 },
    { id: 'b', position: 1024 },
    { id: 'c', position: 2048 },
  ];

  it('без соседей — в конец колонки', () => {
    const { position } = resolveMovePosition(column, null, null);
    expect(position).toBeGreaterThan(2048);
  });

  it('в пустую колонку', () => {
    expect(resolveMovePosition([], null, null).position).toBe(0);
  });

  it('между двумя названными', () => {
    expect(resolveMovePosition(column, 'a', 'b').position).toBe(512);
  });

  it('назван только верхний сосед — встаём перед следующим за ним', () => {
    const { position } = resolveMovePosition(column, 'b', null);
    expect(position).toBeGreaterThan(1024);
    expect(position).toBeLessThan(2048);
  });

  it('назван только нижний сосед — встаём после предыдущего', () => {
    const { position } = resolveMovePosition(column, null, 'b');
    expect(position).toBeGreaterThan(0);
    expect(position).toBeLessThan(1024);
  });

  it('первым в колонке', () => {
    expect(resolveMovePosition(column, null, 'a').position).toBeLessThan(0);
  });

  it('сосед исчез, пока летел запрос, — считаем как край', () => {
    const { position } = resolveMovePosition(column, 'ghost', null);
    expect(position).toBeGreaterThan(2048);
  });

  it('сообщает о необходимости перенумеровать', () => {
    const tight = [
      { id: 'a', position: 1 },
      { id: 'b', position: 1 + 1e-9 },
    ];
    expect(resolveMovePosition(tight, 'a', 'b').rebalance).toBe(true);
  });
});
