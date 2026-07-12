import { decodeMotivationCursor, encodeMotivationCursor, emptyMotivationCursor, weightedPage } from './motivation-feed';

describe('motivation weighted feed', () => {
  it.each([25, 50, 75])('preserves cadence across pages at %s%%', (percent) => {
    const universal = [20,18,16,14,12,10,8,6,4,2], vaishnava = [19,17,15,13,11,9,7,5,3,1];
    let cursor = emptyMotivationCursor(); const actual: number[] = [];
    while (cursor.universal < universal.length || cursor.vaishnava < vaishnava.length) {
      const page = weightedPage(universal, vaishnava, percent, cursor, 3);
      actual.push(...page.items); cursor = decodeMotivationCursor(encodeMotivationCursor(page.cursor));
    }
    expect(new Set(actual).size).toBe(20);
    expect(actual).toEqual(weightedPage(universal, vaishnava, percent, emptyMotivationCursor(), 20).items);
  });
});
