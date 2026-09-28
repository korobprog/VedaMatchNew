import { BadRequestException } from '@nestjs/common';
import {
  decodeMotivationCursor,
  encodeMotivationCursor,
  emptyMotivationCursor,
  feedPage,
  feedTotal,
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

describe('семя случайного порядка в курсоре', () => {
  it('переживает круг через кодирование', () => {
    const cursor = encodeMotivationCursor({
      ...emptyMotivationCursor(),
      shuffleSeed: 'a1b2c3d4',
    });

    expect(decodeMotivationCursor(cursor).shuffleSeed).toBe('a1b2c3d4');
  });

  it('курсоры без семени по-прежнему читаются', () => {
    const cursor = encodeMotivationCursor(emptyMotivationCursor());

    expect(decodeMotivationCursor(cursor).shuffleSeed).toBeUndefined();
  });

  it('не пускает произвольную строку: семя уходит в хеш', () => {
    const bad = Buffer.from(
      JSON.stringify({ ...emptyMotivationCursor(), shuffleSeed: '../../etc' }),
    ).toString('base64url');

    expect(() => decodeMotivationCursor(bad)).toThrow(BadRequestException);
  });
});

describe('feedTotal', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('считает ленту от места, с которого начата первая страница', () => {
    expect(feedTotal(ids, 0, null)).toBe(4);
    expect(feedTotal(ids, 2, null)).toBe(2);
    expect(feedTotal(ids, 9, null)).toBe(0);
  });

  it('закреплённый пост вне остатка ленты добавляет один', () => {
    expect(feedTotal(ids, 0, 'x')).toBe(5);
    // Уже пролистанный пост — тоже вне остатка.
    expect(feedTotal(ids, 2, 'a')).toBe(3);
  });

  it('закреплённый пост из остатка не считается дважды', () => {
    expect(feedTotal(ids, 0, 'c')).toBe(4);
  });
});
