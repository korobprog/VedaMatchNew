import {
  buildInboxWhere,
  clampInboxLimit,
  encodeInboxCursor,
  inboxFetchSize,
  inboxSections,
  INBOX_PAGE_SIZE,
  MAX_INBOX_PAGE_SIZE,
  parseInboxCursor,
  sliceInboxPage,
  type InboxCursor,
} from './inbox-page';

const at = (iso: string) => new Date(iso);

const cursor = (over: Partial<InboxCursor> = {}): InboxCursor => ({
  section: 'unread',
  createdAt: at('2026-09-20T12:00:00.000Z'),
  id: 'n-10',
  ...over,
});

describe('курсор ленты', () => {
  it('переживает дорогу до клиента и обратно', () => {
    const source = cursor({ section: 'read', id: 'n-42' });

    const parsed = parseInboxCursor(encodeInboxCursor(source));

    expect(parsed).toEqual({ kind: 'cursor', cursor: source });
  });

  it('пустое значение — это первая страница, а не ошибка', () => {
    expect(parseInboxCursor(undefined)).toEqual({ kind: 'none' });
    expect(parseInboxCursor(null)).toEqual({ kind: 'none' });
    expect(parseInboxCursor('')).toEqual({ kind: 'none' });
  });

  /**
   * Испорченный курсор нельзя молча принимать за первую страницу: «показать
   * ещё» вернуло бы ту же порцию, и кнопка зациклилась бы.
   */
  it('испорченное значение — ошибка, а не молчаливый возврат к началу', () => {
    expect(parseInboxCursor('не base64 вовсе!!!').kind).toBe('invalid');
    expect(
      parseInboxCursor(Buffer.from('unread|только два').toString('base64url'))
        .kind,
    ).toBe('invalid');
    expect(
      parseInboxCursor(
        Buffer.from('чужое|2026-09-20T12:00:00.000Z|n-1').toString('base64url'),
      ).kind,
    ).toBe('invalid');
    expect(
      parseInboxCursor(Buffer.from('unread|вчера|n-1').toString('base64url'))
        .kind,
    ).toBe('invalid');
    expect(parseInboxCursor(42).kind).toBe('invalid');
  });
});

describe('clampInboxLimit', () => {
  it('без запроса — размер по умолчанию', () => {
    expect(clampInboxLimit(undefined)).toBe(INBOX_PAGE_SIZE);
    expect(clampInboxLimit('')).toBe(INBOX_PAGE_SIZE);
    expect(clampInboxLimit('сколько-нибудь')).toBe(INBOX_PAGE_SIZE);
    expect(clampInboxLimit(0)).toBe(INBOX_PAGE_SIZE);
    expect(clampInboxLimit(-5)).toBe(INBOX_PAGE_SIZE);
  });

  it('принимает число строкой и режет по потолку', () => {
    expect(clampInboxLimit('35')).toBe(35);
    expect(clampInboxLimit(10_000)).toBe(MAX_INBOX_PAGE_SIZE);
  });

  it('просит на строку больше запрошенного, чтобы узнать про продолжение', () => {
    expect(inboxFetchSize(20)).toBe(21);
  });
});

describe('потоки ленты', () => {
  it('без курсора читаются оба: непрочитанное, следом прочитанное', () => {
    expect(inboxSections(null)).toEqual(['unread', 'read']);
  });

  it('курсор в непрочитанном оставляет оба: порция может перевалить границу', () => {
    expect(inboxSections(cursor({ section: 'unread' }))).toEqual([
      'unread',
      'read',
    ]);
  });

  /** Дошли до прочитанного — значит непрочитанное кончилось. */
  it('курсор в прочитанном возвращаться в непрочитанное не заставляет', () => {
    expect(inboxSections(cursor({ section: 'read' }))).toEqual(['read']);
  });
});

describe('buildInboxWhere', () => {
  it('поток непрочитанного — это readAt: null', () => {
    const where = buildInboxWhere({
      userId: 'u1',
      section: 'unread',
      cursor: null,
    });

    expect(where).toEqual({ userId: 'u1', readAt: null });
  });

  it('поток прочитанного — это readAt: не null', () => {
    const where = buildInboxWhere({
      userId: 'u1',
      section: 'read',
      cursor: null,
    });

    expect(where).toEqual({ userId: 'u1', readAt: { not: null } });
  });

  /**
   * Тай-брейк по `id` — не украшение: `createMany` рассылки проставляет всей
   * пачке один `now()`, и без него keyset встал бы на месте.
   */
  it('курсор своего потока превращается в keyset с тай-брейком по id', () => {
    const where = buildInboxWhere({
      userId: 'u1',
      section: 'unread',
      cursor: cursor(),
    });

    expect(where.AND).toEqual([
      {
        OR: [
          { createdAt: { lt: at('2026-09-20T12:00:00.000Z') } },
          { createdAt: at('2026-09-20T12:00:00.000Z'), id: { lt: 'n-10' } },
        ],
      },
    ]);
  });

  it('курсор чужого потока не ограничивает: прочитанное человек ещё не видел', () => {
    const where = buildInboxWhere({
      userId: 'u1',
      section: 'read',
      cursor: cursor({ section: 'unread' }),
    });

    expect(where.AND).toBeUndefined();
  });

  it('условия поиска складываются с keyset через AND', () => {
    const search = { OR: [{ title: { contains: 'ved' } }] };

    const where = buildInboxWhere({
      userId: 'u1',
      section: 'unread',
      cursor: cursor(),
      searchClauses: [search],
    });

    expect(where.AND).toHaveLength(2);
    expect(where.AND?.[1]).toBe(search);
  });
});

describe('sliceInboxPage', () => {
  const row = (id: string, iso: string, readAt: string | null) => ({
    id,
    createdAt: at(iso),
    readAt: readAt === null ? null : at(readAt),
  });

  it('лишняя строка не отдаётся, но говорит, что продолжение есть', () => {
    const rows = [
      row('a', '2026-09-20T12:00:00Z', null),
      row('b', '2026-09-20T11:00:00Z', null),
      row('c', '2026-09-20T10:00:00Z', null),
    ];

    const page = sliceInboxPage(rows, 2);

    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(parseInboxCursor(page.nextCursor)).toEqual({
      kind: 'cursor',
      cursor: {
        section: 'unread',
        createdAt: at('2026-09-20T11:00:00Z'),
        id: 'b',
      },
    });
  });

  it('последняя страница курсора не даёт: кнопке «показать ещё» неоткуда взяться', () => {
    const page = sliceInboxPage([row('a', '2026-09-20T12:00:00Z', null)], 2);

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  /**
   * Порция может перевалить через границу потоков. Курсор тогда обязан быть
   * от последней отданной строки — то есть уже из прочитанного, иначе
   * следующая порция вернулась бы в непрочитанное и выдала бы всё заново.
   */
  it('на границе потоков курсор берёт поток последней строки, а не первой', () => {
    const rows = [
      row('a', '2026-09-20T12:00:00Z', null),
      row('b', '2026-09-19T12:00:00Z', '2026-09-19T13:00:00Z'),
      row('c', '2026-09-18T12:00:00Z', '2026-09-18T13:00:00Z'),
    ];

    const page = sliceInboxPage(rows, 2);

    expect(parseInboxCursor(page.nextCursor)).toEqual({
      kind: 'cursor',
      cursor: {
        section: 'read',
        createdAt: at('2026-09-19T12:00:00Z'),
        id: 'b',
      },
    });
  });

  it('пустая выдача поиска обходится без курсора', () => {
    expect(sliceInboxPage([], 20)).toEqual({ items: [], nextCursor: null });
  });
});
