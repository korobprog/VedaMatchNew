import { ringArcs, ringOuterSize, RING_GAP, RING_STROKE } from './status-ring-geometry';

/** Те же случаи, что у сайта (`status-ring-geometry.spec.ts`), плюс краевые. */
describe('ringArcs (VED-129)', () => {
  it('нет статусов — нет кружка', () => {
    expect(ringArcs(0, 0, 60, 3)).toEqual([]);
    expect(ringArcs(Number.NaN, 0, 60, 3)).toEqual([]);
  });

  it('один статус — одна сплошная секция', () => {
    const arcs = ringArcs(1, 1, 60, 3);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].unseen).toBe(true);
    expect(ringArcs(1, 0, 60, 3)[0].unseen).toBe(false);
    // Две полуокружности подряд: начало и конец пути — верхняя точка.
    expect(arcs[0].d.startsWith('M 30 1.5 A')).toBe(true);
    expect(arcs[0].d.endsWith('30 1.5')).toBe(true);
  });

  it('секций столько же, сколько статусов', () => {
    expect(ringArcs(3, 3, 60, 3)).toHaveLength(3);
    expect(ringArcs(5, 0, 60, 3)).toHaveLength(5);
  });

  it('просмотренные идут первыми, зелёный хвост — непросмотренные', () => {
    expect(ringArcs(4, 1, 60, 3).map((arc) => arc.unseen)).toEqual([false, false, false, true]);
  });

  it('непросмотренных больше, чем статусов, не бывает', () => {
    expect(ringArcs(2, 5, 60, 3).every((arc) => arc.unseen)).toBe(true);
  });

  it('отрицательное число непросмотренных — всё просмотрено', () => {
    expect(ringArcs(2, -1, 60, 3).some((arc) => arc.unseen)).toBe(false);
  });

  it('при двух секциях дуги короче полуокружности — флаг большой дуги 0', () => {
    for (const arc of ringArcs(2, 2, 60, 3)) expect(arc.d).toMatch(/A 28\.5 28\.5 0 0 1/);
  });
});

describe('ringOuterSize', () => {
  it('кольцо с зазором с обеих сторон аватарки', () => {
    expect(ringOuterSize(52)).toBe(52 + (RING_GAP + RING_STROKE) * 2);
  });
});
