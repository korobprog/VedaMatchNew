import { formatDeletionDate, isDeletionScheduled } from './deletion';

describe('isDeletionScheduled', () => {
  it('нет запроса на удаление — false', () => {
    expect(isDeletionScheduled({ pendingDeletionAt: null })).toBe(false);
  });

  it('есть дата запроса — true', () => {
    expect(
      isDeletionScheduled({ pendingDeletionAt: '2026-09-18T12:00:00Z' }),
    ).toBe(true);
  });
});

describe('formatDeletionDate', () => {
  it('форматирует ISO-дату по-русски', () => {
    expect(formatDeletionDate('2026-10-02T00:00:00Z')).toBe('2 октября 2026 г.');
  });
});
