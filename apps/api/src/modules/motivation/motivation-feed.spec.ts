import {
  decodeMotivationCursor,
  encodeMotivationCursor,
  emptyMotivationCursor,
  weightedPage,
  moveOwnToReadableTrack,
} from './motivation-feed';

describe('motivation weighted feed', () => {
  it.each([25, 50, 75])('preserves cadence across pages at %s%%', (percent) => {
    const universal = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2],
      vaishnava = [19, 17, 15, 13, 11, 9, 7, 5, 3, 1];
    let cursor = emptyMotivationCursor();
    const actual: number[] = [];
    while (
      cursor.universal < universal.length ||
      cursor.vaishnava < vaishnava.length
    ) {
      const page = weightedPage(universal, vaishnava, percent, cursor, 3);
      actual.push(...page.items);
      cursor = decodeMotivationCursor(encodeMotivationCursor(page.cursor));
    }
    expect(new Set(actual).size).toBe(20);
    expect(actual).toEqual(
      weightedPage(universal, vaishnava, percent, emptyMotivationCursor(), 20)
        .items,
    );
  });
});

describe('moveOwnToReadableTrack', () => {
  const own = { id: 'own', authorUserId: 'u1' };
  const other = { id: 'other', authorUserId: 'u2' };

  it('при нулевой доле вайшнавского поднимает свой рилс в читаемый трек', () => {
    // Иначе автору пишут «ваш рилс опубликован», он идёт и не находит его:
    // рилс лежит в треке, который он себе отключил.
    const result = moveOwnToReadableTrack({
      universal: [other],
      vaishnava: [own],
      percent: 0,
      userId: 'u1',
    });

    expect(result.universal.map((post) => post.id)).toEqual(['own', 'other']);
  });

  it('при доле 100 переносит свой универсальный рилс в вайшнавский трек', () => {
    const result = moveOwnToReadableTrack({
      universal: [own],
      vaishnava: [other],
      percent: 100,
      userId: 'u1',
    });

    expect(result.vaishnava.map((post) => post.id)).toEqual(['own', 'other']);
  });

  it('чужие рилсы не трогает', () => {
    const result = moveOwnToReadableTrack({
      universal: [],
      vaishnava: [other],
      percent: 0,
      userId: 'u1',
    });

    expect(result.universal).toEqual([]);
    expect(result.vaishnava).toEqual([other]);
  });

  it('при промежуточной доле читаются оба трека — переносить нечего', () => {
    const input = {
      universal: [other],
      vaishnava: [own],
      percent: 50,
      userId: 'u1',
    };

    const result = moveOwnToReadableTrack(input);

    expect(result.universal).toBe(input.universal);
    expect(result.vaishnava).toBe(input.vaishnava);
  });
});
