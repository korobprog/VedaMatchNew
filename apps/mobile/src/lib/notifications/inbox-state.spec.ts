import type { NotificationItemDto } from '@vedamatch/shared';
import {
  badgeLabel,
  MAX_RELOAD,
  reloadSize,
  unreadSectionCount,
  buildInboxSections,
  countUnreadItems,
  dayTitle,
  formatWhen,
  markAllItemsRead,
  markItemRead,
  mergeInboxPages,
} from './inbox-state';

function item(
  id: string,
  overrides: Partial<NotificationItemDto> = {},
): NotificationItemDto {
  return {
    id,
    title: `Заголовок ${id}`,
    body: `Текст ${id}`,
    url: '/notifications',
    category: 'chat',
    createdAt: '2026-09-22T10:00:00.000Z',
    readAt: null,
    mark: null,
    ...overrides,
  };
}

describe('mergeInboxPages', () => {
  it('дописывает порцию в конец', () => {
    const merged = mergeInboxPages([item('a')], [item('b'), item('c')]);
    expect(merged.map((one) => one.id)).toEqual(['a', 'b', 'c']);
  });

  it('дубль из-за перехода между потоками не удваивает строку', () => {
    // Keyset: уведомление, прочитанное после того, как человек прошёл мимо
    // него в потоке непрочитанного, придёт второй раз в потоке прочитанного.
    const merged = mergeInboxPages([item('a'), item('b')], [item('b'), item('c')]);
    expect(merged.map((one) => one.id)).toEqual(['a', 'b', 'c']);
  });

  it('у дубля выигрывает уже показанная строка: на ней свежая отметка', () => {
    const shown = item('a', { readAt: '2026-09-22T11:00:00.000Z' });
    const stale = item('a', { readAt: null });
    expect(mergeInboxPages([shown], [stale])[0].readAt).toBe('2026-09-22T11:00:00.000Z');
  });

  it('не меняет исходный список', () => {
    const current = [item('a')];
    mergeInboxPages(current, [item('b')]);
    expect(current).toHaveLength(1);
  });
});

describe('markItemRead', () => {
  const at = new Date('2026-09-22T12:00:00.000Z');

  it('ставит дату только нужной строке', () => {
    const result = markItemRead([item('a'), item('b')], 'a', at);
    expect(result[0].readAt).toBe(at.toISOString());
    expect(result[1].readAt).toBeNull();
  });

  it('уже прочитанному дату не переписывает', () => {
    const earlier = '2026-09-21T08:00:00.000Z';
    const result = markItemRead([item('a', { readAt: earlier })], 'a', at);
    expect(result[0].readAt).toBe(earlier);
  });

  it('незнакомый id ничего не ломает', () => {
    expect(markItemRead([item('a')], 'нет такого', at)[0].readAt).toBeNull();
  });
});

describe('markAllItemsRead', () => {
  it('гасит всё непрочитанное и не трогает прочитанное', () => {
    const at = new Date('2026-09-22T12:00:00.000Z');
    const earlier = '2026-09-20T08:00:00.000Z';
    const result = markAllItemsRead([item('a'), item('b', { readAt: earlier })], at);
    expect(result[0].readAt).toBe(at.toISOString());
    expect(result[1].readAt).toBe(earlier);
  });
});

describe('countUnreadItems', () => {
  it('считает только непрочитанное', () => {
    expect(countUnreadItems([])).toBe(0);
    expect(
      countUnreadItems([item('a'), item('b', { readAt: '2026-09-22T09:00:00.000Z' }), item('c')]),
    ).toBe(2);
  });
});

describe('dayTitle', () => {
  const now = new Date(2026, 8, 22, 10, 0, 0); // 22 сентября 2026, местное время

  it('сегодня и вчера — словами', () => {
    expect(dayTitle(new Date(2026, 8, 22, 1, 0, 0), now)).toBe('Сегодня');
    expect(dayTitle(new Date(2026, 8, 21, 23, 0, 0), now)).toBe('Вчера');
  });

  it('«вчера» считается по календарю, а не вычитанием суток', () => {
    // 23 часа назад, но уже позавчера по календарю — значит не «Вчера».
    const midnight = new Date(2026, 8, 22, 0, 30, 0);
    expect(dayTitle(new Date(2026, 8, 20, 23, 30, 0), midnight)).toBe('20 сентября');
  });

  it('свой год без года, чужой — с годом', () => {
    expect(dayTitle(new Date(2026, 0, 3), now)).toBe('3 января');
    expect(dayTitle(new Date(2025, 11, 31), now)).toBe('31 декабря 2025');
  });
});

describe('buildInboxSections', () => {
  const now = new Date(2026, 8, 22, 12, 0, 0);
  const iso = (d: Date) => d.toISOString();

  it('непрочитанное — одной секцией «Новое», без разбивки по дням', () => {
    const items = [
      item('a', { createdAt: iso(new Date(2026, 8, 22, 9)) }),
      item('b', { createdAt: iso(new Date(2026, 8, 19, 9)) }),
    ];
    const sections = buildInboxSections(items, now);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ key: 'unread', title: 'Новое', unread: true });
    expect(sections[0].data.map((one) => one.id)).toEqual(['a', 'b']);
  });

  it('прочитанное разбивается по дням в порядке ленты', () => {
    const items = [
      item('a', { createdAt: iso(new Date(2026, 8, 22, 9)), readAt: iso(now) }),
      item('b', { createdAt: iso(new Date(2026, 8, 22, 8)), readAt: iso(now) }),
      item('c', { createdAt: iso(new Date(2026, 8, 21, 8)), readAt: iso(now) }),
    ];
    const sections = buildInboxSections(items, now);
    expect(sections.map((one) => one.title)).toEqual(['Сегодня', 'Вчера']);
    expect(sections[0].data.map((one) => one.id)).toEqual(['a', 'b']);
    expect(sections[1].data.map((one) => one.id)).toEqual(['c']);
    expect(sections.every((one) => one.unread === false)).toBe(true);
  });

  it('«Новое» идёт первой секцией, прочитанное следом', () => {
    const items = [
      item('new'),
      item('old', { createdAt: iso(new Date(2026, 8, 21, 8)), readAt: iso(now) }),
    ];
    expect(buildInboxSections(items, now).map((one) => one.key)).toEqual([
      'unread',
      'read-2026-09-21',
    ]);
  });

  it('пустых секций не бывает, у пустой ленты секций нет', () => {
    expect(buildInboxSections([], now)).toEqual([]);
    expect(buildInboxSections([item('a')], now).map((one) => one.key)).toEqual(['unread']);
  });

  it('строку с неразобранной датой не теряет', () => {
    const sections = buildInboxSections(
      [item('a', { createdAt: 'не дата', readAt: iso(now) })],
      now,
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Ранее');
    expect(sections[0].data.map((one) => one.id)).toEqual(['a']);
  });

  it('ключи секций разных лет не сталкиваются', () => {
    const items = [
      item('a', { createdAt: iso(new Date(2026, 8, 20, 8)), readAt: iso(now) }),
      item('b', { createdAt: iso(new Date(2025, 8, 20, 8)), readAt: iso(now) }),
    ];
    const sections = buildInboxSections(items, now);
    expect(new Set(sections.map((one) => one.key)).size).toBe(2);
    expect(sections.map((one) => one.title)).toEqual(['20 сентября', '20 сентября 2025']);
  });
});

describe('formatWhen', () => {
  const now = new Date('2026-09-22T12:00:00.000Z');

  it('минуты, часы и дата', () => {
    expect(formatWhen('2026-09-22T11:58:00.000Z', now)).toBe('2 мин назад');
    expect(formatWhen('2026-09-22T09:00:00.000Z', now)).toBe('3 ч назад');
    expect(formatWhen('2026-09-19T09:00:00.000Z', now)).toBe('19 сентября');
  });

  it('только что — и для будущей даты тоже', () => {
    expect(formatWhen('2026-09-22T11:59:50.000Z', now)).toBe('только что');
    // Часы телефона отстали от серверных: «через 3 минуты» выглядит поломкой.
    expect(formatWhen('2026-09-22T12:03:00.000Z', now)).toBe('только что');
  });

  it('неразобранная дата не рисует «Invalid Date»', () => {
    expect(formatWhen('не дата', now)).toBe('');
  });
});

describe('badgeLabel', () => {
  it('ноль и меньше — значка нет', () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-3)).toBeNull();
  });

  it('число, а от сотни — «99+»', () => {
    expect(badgeLabel(1)).toBe('1');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(100)).toBe('99+');
  });
});

describe('reloadSize', () => {
  it('просит столько же, сколько было показано', () => {
    // Раунд оценки 001, дефект 5: долистал до сотни, нажал «Прочитать все»
    // — и вернулся к двадцати, потеряв место в ленте.
    expect(reloadSize(100)).toBe(100);
    expect(reloadSize(60)).toBe(60);
  });

  it('меньше порции не просит: пустая лента не должна ужать запрос до нуля', () => {
    expect(reloadSize(0)).toBe(20);
    expect(reloadSize(1)).toBe(20);
    expect(reloadSize(-5)).toBe(20);
  });

  it('не просит больше, чем отдаст сервер', () => {
    expect(reloadSize(500)).toBe(MAX_RELOAD);
    expect(MAX_RELOAD).toBe(100);
  });

  it('мусор не ломает запрос', () => {
    expect(reloadSize(Number.NaN)).toBe(20);
    expect(reloadSize(20.7)).toBe(20);
  });
});

describe('unreadSectionCount', () => {
  const twenty = Array.from({ length: 20 }, (_, index) => item(`n-${index}`));

  it('обычная лента: число от сервера, а не длина порции', () => {
    // Живой случай: колокольчик показывал 21, заголовок — 20, потому что
    // порция ровно двадцать (раунд оценки 001, дефект 1).
    expect(unreadSectionCount({ items: twenty, total: 21, searchActive: false })).toBe(21);
  });

  it('в выдаче поиска считается найденное: серверное «всё» к ней не относится', () => {
    expect(unreadSectionCount({ items: [item('a')], total: 21, searchActive: true })).toBe(1);
    expect(
      unreadSectionCount({
        items: [item('a'), item('b', { readAt: '2026-09-22T09:00:00.000Z' })],
        total: 21,
        searchActive: true,
      }),
    ).toBe(1);
  });

  it('ноль непрочитанного остаётся нулём в обоих случаях', () => {
    expect(unreadSectionCount({ items: [], total: 0, searchActive: false })).toBe(0);
    expect(unreadSectionCount({ items: [], total: 0, searchActive: true })).toBe(0);
  });
});
