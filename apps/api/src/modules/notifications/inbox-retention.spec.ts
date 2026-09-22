import {
  buildInboxPurgeWhere,
  READ_RETENTION_MS,
  UNREAD_RETENTION_MS,
} from './inbox-retention';

const now = new Date('2026-09-22T12:00:00.000Z');

/** Подходит ли строка под условие удаления — та же проверка, что сделает база. */
function expired(row: { createdAt: Date; readAt: Date | null }): boolean {
  const where = buildInboxPurgeWhere(now);
  const [byRead, byAge] = where.OR;
  return (
    (row.readAt !== null && row.readAt < byRead.readAt.lt) ||
    row.createdAt < byAge.createdAt.lt
  );
}

describe('buildInboxPurgeWhere', () => {
  it('прочитанное живёт неделю', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(READ_RETENTION_MS).toBe(7 * day);
    expect(UNREAD_RETENTION_MS).toBe(30 * day);
  });

  it('только что прочитанное остаётся: перезагрузка страницы не теряет список', () => {
    expect(
      expired({
        createdAt: new Date('2026-09-22T11:00:00Z'),
        readAt: new Date('2026-09-22T11:30:00Z'),
      }),
    ).toBe(false);
  });

  it('прочитанное больше недели назад уходит', () => {
    expect(
      expired({
        createdAt: new Date('2026-09-10T12:00:00Z'),
        readAt: new Date('2026-09-14T12:00:00Z'),
      }),
    ).toBe(true);
  });

  /** Иначе лента человека, переставшего заходить, растёт без конца. */
  it('непрочитанное старше месяца уходит тоже', () => {
    expect(
      expired({ createdAt: new Date('2026-08-01T12:00:00Z'), readAt: null }),
    ).toBe(true);
  });

  it('непрочитанное моложе месяца остаётся, сколько бы ни лежало', () => {
    expect(
      expired({ createdAt: new Date('2026-09-01T12:00:00Z'), readAt: null }),
    ).toBe(false);
  });

  /** Условие без `userId`: чистит воркер и сразу у всех. Раньше её запускал
   *  сам читатель, и у того, кто не заходит, она не срабатывала никогда. */
  it('не привязано к человеку', () => {
    expect(Object.keys(buildInboxPurgeWhere(now))).toEqual(['OR']);
  });
});
