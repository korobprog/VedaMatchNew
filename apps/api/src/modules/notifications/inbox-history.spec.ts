import {
  buildHistoryWhere,
  clampHistoryLimit,
  closedTaskReaders,
  contactOnlyData,
  encodeHistoryCursor,
  HISTORY_ORDER_BY,
  HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
  parseHistoryCursor,
  readContactData,
  readStateData,
  sliceHistoryPage,
} from './inbox-history';
import { encodeInboxCursor } from './inbox-page';

const now = new Date('2026-09-24T10:00:00.000Z');

describe('курсор истории', () => {
  it('туда и обратно без потерь', () => {
    const cursor = {
      contactAt: new Date('2026-09-24T09:59:59.123Z'),
      id: 'b7c1',
    };
    expect(parseHistoryCursor(encodeHistoryCursor(cursor))).toEqual({
      kind: 'cursor',
      cursor,
    });
  });

  it('пусто — первая порция', () => {
    expect(parseHistoryCursor(undefined)).toEqual({ kind: 'none' });
    expect(parseHistoryCursor('')).toEqual({ kind: 'none' });
  });

  it('курсор ленты историей не принимается: порядок у них разный', () => {
    const inbox = encodeInboxCursor({
      section: 'read',
      createdAt: now,
      id: 'x',
    });
    expect(parseHistoryCursor(inbox)).toEqual({ kind: 'invalid' });
  });

  it('мусор — invalid, а не «с начала»: иначе «Показать ещё» зациклится', () => {
    expect(parseHistoryCursor('не-курсор')).toEqual({ kind: 'invalid' });
    expect(parseHistoryCursor(42)).toEqual({ kind: 'invalid' });
    const broken = Buffer.from('history|вчера|x', 'utf8').toString('base64url');
    expect(parseHistoryCursor(broken)).toEqual({ kind: 'invalid' });
  });
});

describe('размер порции', () => {
  it('по умолчанию — как у ленты', () => {
    expect(clampHistoryLimit(undefined)).toBe(HISTORY_PAGE_SIZE);
    expect(clampHistoryLimit('abc')).toBe(HISTORY_PAGE_SIZE);
    expect(clampHistoryLimit('0')).toBe(HISTORY_PAGE_SIZE);
  });

  it('больше потолка не отдаём', () => {
    expect(clampHistoryLimit('5000')).toBe(MAX_HISTORY_PAGE_SIZE);
    expect(clampHistoryLimit('7')).toBe(7);
  });
});

describe('выборка истории', () => {
  it('только прочитанное этого человека, и только с отметкой контакта', () => {
    expect(buildHistoryWhere('u1', null)).toEqual({
      userId: 'u1',
      readAt: { not: null },
      contactAt: { not: null },
    });
  });

  it('keyset: строго дальше последней отданной строки, тай-брейк по id', () => {
    const contactAt = new Date('2026-09-24T09:00:00Z');
    expect(buildHistoryWhere('u1', { contactAt, id: 'm' })).toMatchObject({
      OR: [{ contactAt: { lt: contactAt } }, { contactAt, id: { lt: 'm' } }],
    });
  });

  it('порядок — последний контакт сверху, как у истории переходов', () => {
    expect(HISTORY_ORDER_BY).toEqual([{ contactAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('sliceHistoryPage', () => {
  const rows = [
    { id: 'c', contactAt: new Date('2026-09-24T09:00:00Z') },
    { id: 'b', contactAt: new Date('2026-09-24T08:00:00Z') },
    { id: 'a', contactAt: new Date('2026-09-24T07:00:00Z') },
  ];

  it('лишняя строка значит «есть продолжение», курсор — с последней отданной', () => {
    const page = sliceHistoryPage(rows, 2);
    expect(page.items.map((row) => row.id)).toEqual(['c', 'b']);
    expect(parseHistoryCursor(page.nextCursor)).toEqual({
      kind: 'cursor',
      cursor: { contactAt: rows[1].contactAt, id: 'b' },
    });
  });

  it('всё поместилось — курсора нет', () => {
    expect(sliceHistoryPage(rows, 3).nextCursor).toBeNull();
    expect(sliceHistoryPage([], 3)).toEqual({ items: [], nextCursor: null });
  });
});

describe('что пишет контакт', () => {
  it('прочтение непрочитанного — прочтение и контакт одной датой', () => {
    // Иначе строка ушла бы из «Нового», но в историю не попала бы.
    expect(readContactData(now)).toEqual({ readAt: now, contactAt: now });
  });

  it('открытие прочитанного — только контакт, дата прочтения прежняя', () => {
    expect(contactOnlyData(now)).toEqual({ contactAt: now });
  });

  it('кнопка «прочитано» у непрочитанного ставит обе даты', () => {
    expect(readStateData(null, true, now)).toEqual({
      readAt: now,
      contactAt: now,
    });
  });

  it('повторное «прочитано» не переставляет дату прочтения, но это контакт', () => {
    const earlier = new Date('2026-09-20T10:00:00Z');
    expect(readStateData(earlier, true, now)).toEqual({
      readAt: earlier,
      contactAt: now,
    });
  });

  it('«вернуть в непрочитанные» — тоже контакт; из истории строка уходит', () => {
    const earlier = new Date('2026-09-20T10:00:00Z');
    expect(readStateData(earlier, false, now)).toEqual({
      readAt: null,
      contactAt: now,
    });
    // История берёт только прочитанное.
    expect(buildHistoryWhere('u1', null)).toMatchObject({
      readAt: { not: null },
    });
  });
});

describe('closedTaskReaders — кому гасить уведомления о закрытой задаче', () => {
  it('закрывший и тот, от чьего имени действовал агент', () => {
    expect(closedTaskReaders(['agent', 'stas'])).toEqual(['agent', 'stas']);
  });

  it('человек сам — один получатель', () => {
    expect(closedTaskReaders(['stas', null])).toEqual(['stas']);
  });

  it('пустые и повторы отбрасываются', () => {
    expect(closedTaskReaders(['stas', 'stas', '', undefined])).toEqual([
      'stas',
    ]);
    expect(closedTaskReaders([null])).toEqual([]);
  });
});
