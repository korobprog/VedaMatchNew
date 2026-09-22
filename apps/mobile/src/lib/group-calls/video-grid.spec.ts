import { tileFraction, videoGridLayout } from './video-grid';

/**
 * Раскладка решается таблицей, а не на глаз: составов всего четыре и обе
 * ориентации встретятся в первой же живой проверке втроём.
 */

describe('вертикальный экран телефона', () => {
  it('один — на весь экран', () => {
    expect(videoGridLayout(1, false)).toEqual({ columns: 1, rows: 1 });
  });

  it('двое — друг над другом, а не двумя узкими полосами', () => {
    expect(videoGridLayout(2, false)).toEqual({ columns: 1, rows: 2 });
  });

  it('трое — три строки во всю ширину', () => {
    expect(videoGridLayout(3, false)).toEqual({ columns: 1, rows: 3 });
  });

  it('четверо — 2×2, без пустой клетки', () => {
    expect(videoGridLayout(4, false)).toEqual({ columns: 2, rows: 2 });
  });
});

describe('широкий экран (сайт, телефон боком)', () => {
  it('двое — рядом', () => {
    expect(videoGridLayout(2, true)).toEqual({ columns: 2, rows: 1 });
  });

  it('трое — в ряд', () => {
    expect(videoGridLayout(3, true)).toEqual({ columns: 3, rows: 1 });
  });

  it('четверо — та же 2×2, что и вертикально', () => {
    expect(videoGridLayout(4, true)).toEqual(videoGridLayout(4, false));
  });
});

describe('клеток хватает на всех', () => {
  it('ни один участник не остаётся без места', () => {
    for (const wide of [true, false])
      for (let count = 1; count <= 4; count += 1) {
        const layout = videoGridLayout(count, wide);
        expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(count);
      }
  });

  it('лишних клеток не больше одной — пустая клетка читается как «кто-то отвалился»', () => {
    for (const wide of [true, false])
      for (let count = 1; count <= 4; count += 1) {
        const layout = videoGridLayout(count, wide);
        expect(layout.columns * layout.rows - count).toBeLessThanOrEqual(0);
      }
  });
});

describe('вырожденные случаи', () => {
  it('пустая комната — пустая сетка, а не 1×1 с пустотой', () => {
    expect(videoGridLayout(0, false)).toEqual({ columns: 0, rows: 0 });
    expect(tileFraction({ columns: 0, rows: 0 })).toEqual({ width: 0, height: 0 });
  });

  it('мусор вместо числа не ломает раскладку', () => {
    expect(videoGridLayout(Number.NaN, false)).toEqual({ columns: 0, rows: 0 });
    expect(videoGridLayout(-3, true)).toEqual({ columns: 0, rows: 0 });
  });
});

describe('доля плитки', () => {
  it('трое вертикально — треть высоты и вся ширина', () => {
    expect(tileFraction(videoGridLayout(3, false))).toEqual({
      width: 1,
      height: 1 / 3,
    });
  });

  it('четверо — четверть площади', () => {
    const { width, height } = tileFraction(videoGridLayout(4, false));
    expect(width * height).toBeCloseTo(0.25);
  });
});
