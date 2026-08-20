import {
  decodeMotivationCursor,
  encodeMotivationCursor,
  emptyMotivationCursor,
  feedPage,
} from './motivation-feed';

describe('feedPage', () => {
  const posts = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  it('листает ленту без потерь и повторов', () => {
    let cursor = emptyMotivationCursor();
    const seen: number[] = [];
    for (;;) {
      const page = feedPage(posts, cursor, 3);
      if (page.items.length === 0) break;
      seen.push(...page.items);
      // Курсор переживает кодирование: клиент присылает его строкой.
      cursor = decodeMotivationCursor(encodeMotivationCursor(page.cursor));
    }

    expect(seen).toEqual(posts);
    expect(new Set(seen).size).toBe(posts.length);
  });

  it('на исчерпанной ленте отдаёт пусто и не двигает курсор', () => {
    const cursor = { ...emptyMotivationCursor(), universal: posts.length };

    const page = feedPage(posts, cursor, 5);

    expect(page.items).toEqual([]);
    expect(page.cursor.universal).toBe(posts.length);
  });

  it('принимает курсор, выданный до отказа от смешивания треков', () => {
    // Такие курсоры живут в открытых вкладках: падать на них незачем.
    const legacy = decodeMotivationCursor(
      encodeMotivationCursor({ universal: 2, vaishnava: 7, accumulator: 40 }),
    );

    const page = feedPage(posts, legacy, 2);

    expect(page.items).toEqual([8, 7]);
    expect(page.cursor).toMatchObject({ vaishnava: 7, accumulator: 40 });
  });
});


describe('decodeMotivationCursor', () => {
  it('без значения начинает ленту сначала', () => {
    expect(decodeMotivationCursor()).toEqual(emptyMotivationCursor());
  });

  it('отвергает подделанный курсор', () => {
    // Курсор приходит от клиента строкой: дробная или отрицательная позиция
    // увела бы выборку в бессмыслицу.
    expect(() => decodeMotivationCursor('не-курсор')).toThrow();
    expect(() =>
      decodeMotivationCursor(
        Buffer.from(JSON.stringify({ universal: -1, vaishnava: 0, accumulator: 0 })).toString(
          'base64url',
        ),
      ),
    ).toThrow();
    expect(() =>
      decodeMotivationCursor(
        Buffer.from(JSON.stringify({ universal: 1.5, vaishnava: 0, accumulator: 0 })).toString(
          'base64url',
        ),
      ),
    ).toThrow();
  });
});
