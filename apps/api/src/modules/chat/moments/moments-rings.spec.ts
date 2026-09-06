import type { ChatMomentRing } from '@vedamatch/shared';
import { firstUnseenIndex, hasUnseen, sortRings } from './moments-rings';

function ring(part: Partial<ChatMomentRing>): ChatMomentRing {
  return {
    author: { id: 'u', name: 'Кто-то', avatarUrl: null, lastSeenAt: null },
    mine: false,
    total: 1,
    unseen: 0,
    previewUrl: null,
    previewBackground: null,
    lastPublishedAt: '2026-09-06T10:00:00.000Z',
    ...part,
  };
}

describe('порядок колец', () => {
  it('своё кольцо первое, даже когда всё просмотрено', () => {
    const rings = sortRings([
      ring({ unseen: 3, lastPublishedAt: '2026-09-06T12:00:00.000Z' }),
      ring({ mine: true, unseen: 0, lastPublishedAt: '2026-09-05T09:00:00.000Z' }),
    ]);
    expect(rings[0]!.mine).toBe(true);
  });

  it('непросмотренные идут раньше просмотренных, даже если те свежее', () => {
    const rings = sortRings([
      ring({ unseen: 0, lastPublishedAt: '2026-09-06T23:00:00.000Z' }),
      ring({ unseen: 1, lastPublishedAt: '2026-09-06T01:00:00.000Z' }),
    ]);
    expect(rings[0]!.unseen).toBe(1);
  });

  it('внутри группы — по свежести', () => {
    const rings = sortRings([
      ring({ unseen: 1, lastPublishedAt: '2026-09-06T01:00:00.000Z' }),
      ring({ unseen: 1, lastPublishedAt: '2026-09-06T05:00:00.000Z' }),
    ]);
    expect(rings[0]!.lastPublishedAt).toBe('2026-09-06T05:00:00.000Z');
  });

  it('исходный список не меняется', () => {
    const source = [ring({ unseen: 0 }), ring({ mine: true })];
    sortRings(source);
    expect(source[0]!.mine).toBe(false);
  });
});

describe('признак «есть что смотреть»', () => {
  it('своё непросмотренное кольцо не считается', () => {
    expect(hasUnseen([ring({ mine: true, unseen: 2 })])).toBe(false);
  });

  it('чужое непросмотренное считается', () => {
    expect(hasUnseen([ring({ unseen: 1 })])).toBe(true);
  });
});

describe('с какого момента открывать', () => {
  it('с первого непросмотренного', () => {
    expect(firstUnseenIndex([true, true, false, false])).toBe(2);
  });

  it('просмотренное целиком открывается с начала', () => {
    expect(firstUnseenIndex([true, true])).toBe(0);
  });

  it('пустая лента не ломает расчёт', () => {
    expect(firstUnseenIndex([])).toBe(0);
  });
});
