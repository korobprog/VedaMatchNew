import {
  buildInboxPurgeWhere,
  READ_RETENTION_MS,
  UNREAD_RETENTION_MS,
} from './inbox-retention';

const now = new Date('2026-09-22T12:00:00.000Z');

/** Подходит ли строка под условие удаления — та же проверка, что сделает база. */
function expired(row: {
  createdAt: Date;
  readAt: Date | null;
  contactAt?: Date | null;
}): boolean {
  const contactAt = row.contactAt === undefined ? row.readAt : row.contactAt;
  const where = buildInboxPurgeWhere(now);
  const [byContact, byRead, byAge] = where.OR;
  return (
    (row.readAt !== null &&
      contactAt !== null &&
      contactAt < byContact.contactAt.lt) ||
    (row.readAt !== null &&
      contactAt === null &&
      row.readAt < byRead.readAt.lt) ||
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

  it('неделя считается от последнего контакта, а не от прочтения (VED-404)', () => {
    // Прочитано восемь дней назад, открыто из истории вчера — остаётся.
    expect(
      expired({
        createdAt: new Date('2026-09-13T12:00:00Z'),
        readAt: new Date('2026-09-14T12:00:00Z'),
        contactAt: new Date('2026-09-21T12:00:00Z'),
      }),
    ).toBe(false);
  });

  it('прочитанное без отметки контакта — по дате прочтения, как было', () => {
    expect(
      expired({
        createdAt: new Date('2026-09-10T12:00:00Z'),
        readAt: new Date('2026-09-14T12:00:00Z'),
        contactAt: null,
      }),
    ).toBe(true);
  });

  it('контакт с непрочитанным (вернул в непрочитанные) неделю не отсчитывает', () => {
    expect(
      expired({
        createdAt: new Date('2026-09-10T12:00:00Z'),
        readAt: null,
        contactAt: new Date('2026-09-11T12:00:00Z'),
      }),
    ).toBe(false);
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
