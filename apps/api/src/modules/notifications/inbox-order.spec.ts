import { compareInboxRows, sortInboxRows } from './inbox-order';

const at = (iso: string) => new Date(iso);

describe('sortInboxRows', () => {
  it('ставит непрочитанное выше прочитанного', () => {
    const read = {
      createdAt: at('2026-09-20T12:00:00Z'),
      readAt: at('2026-09-20T12:30:00Z'),
    };
    const unread = { createdAt: at('2026-09-01T09:00:00Z'), readAt: null };
    expect(sortInboxRows([read, unread])).toEqual([unread, read]);
  });

  it('внутри непрочитанного свежее сверху', () => {
    const older = { createdAt: at('2026-09-18T10:00:00Z'), readAt: null };
    const newer = { createdAt: at('2026-09-19T10:00:00Z'), readAt: null };
    expect(sortInboxRows([older, newer])).toEqual([newer, older]);
  });

  /**
   * Тот самый дефект VED-153: строки прочитаны в обратном порядке своего
   * возраста. Старое уведомление открыли только что, свежее — давно; старый
   * `orderBy` по `readAt asc` поднял бы старое наверх.
   */
  it('внутри прочитанного свежее сверху, а не то, что открыли раньше', () => {
    const oldPostReadNow = {
      createdAt: at('2026-09-01T08:00:00Z'),
      readAt: at('2026-09-20T18:00:00Z'),
    };
    const freshPostReadLongAgo = {
      createdAt: at('2026-09-19T08:00:00Z'),
      readAt: at('2026-09-19T08:05:00Z'),
    };
    expect(sortInboxRows([oldPostReadNow, freshPostReadLongAgo])).toEqual([
      freshPostReadLongAgo,
      oldPostReadNow,
    ]);
  });

  it('«отметить все прочитанными» не перемешивает список: порядок по дате', () => {
    const markedAt = at('2026-09-20T20:00:00Z');
    const rows = [
      { id: 'old', createdAt: at('2026-09-10T00:00:00Z'), readAt: markedAt },
      { id: 'new', createdAt: at('2026-09-19T00:00:00Z'), readAt: markedAt },
      { id: 'mid', createdAt: at('2026-09-15T00:00:00Z'), readAt: markedAt },
    ];
    expect(sortInboxRows(rows).map((row) => row.id)).toEqual([
      'new',
      'mid',
      'old',
    ]);
  });

  it('не трогает исходный массив', () => {
    const rows = [
      {
        createdAt: at('2026-09-01T00:00:00Z'),
        readAt: at('2026-09-02T00:00:00Z'),
      },
      { createdAt: at('2026-09-03T00:00:00Z'), readAt: null },
    ];
    const copy = [...rows];
    sortInboxRows(rows);
    expect(rows).toEqual(copy);
  });

  it('сравнение непротиворечиво: равные строки дают ноль', () => {
    const row = { createdAt: at('2026-09-01T00:00:00Z'), readAt: null };
    expect(compareInboxRows(row, { ...row })).toBe(0);
  });
});
