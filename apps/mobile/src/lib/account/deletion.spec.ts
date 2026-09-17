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
    expect(formatDeletionDate('2026-10-02T00:00:00Z')).toBe('2 октября 2026 г');
  });

  // Русский формат сам кончается на «г.», и фраза на экране («Аккаунт будет
  // удалён …».) получалась с двумя точками подряд.
  it('не оставляет точку в конце', () => {
    const text = formatDeletionDate('2026-10-02T00:00:00.000Z');
    expect(text.endsWith('.')).toBe(false);
    expect(`Аккаунт будет удалён ${text}.`).not.toContain('..');
  });
});
