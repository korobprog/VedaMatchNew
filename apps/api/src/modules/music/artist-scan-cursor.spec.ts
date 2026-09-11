import {
  afterCursorWhere,
  decodeScanCursor,
  encodeScanCursor,
} from './artist-scan-cursor';

const ID = '0b7d6e2c-1111-4222-8333-944455556666';

describe('artist scan cursor', () => {
  it('читает обратно то, что записал', () => {
    const cursor = { createdAt: new Date('2026-09-01T10:00:00.000Z'), id: ID };
    expect(decodeScanCursor(encodeScanCursor(cursor))).toEqual(cursor);
  });

  // Битый курсор — начать сначала, а не уронить разбор.
  it.each([
    undefined,
    '',
    'мусор',
    `не-дата|${ID}`,
    '2026-09-01T10:00:00Z|; drop',
  ])('не принимает %p', (raw) => {
    expect(decodeScanCursor(raw)).toBeNull();
  });

  it('без курсора — с начала коллекции', () => {
    expect(afterCursorWhere(null)).toEqual({});
  });

  // Записи одной партии создаются в одну секунду: без `id` часть из них
  // выпала бы между прогонами.
  it('после курсора — позже по времени или то же время и дальше по id', () => {
    const createdAt = new Date('2026-09-01T10:00:00.000Z');
    expect(afterCursorWhere({ createdAt, id: ID })).toEqual({
      OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: ID } }],
    });
  });
});
