import {
  isDirectUrl,
  isPurgeConfirmed,
  mergePurgeContributions,
} from './user-purge';

describe('mergePurgeContributions', () => {
  it('складывает ключи и счётчики всех сервисов', () => {
    expect(
      mergePurgeContributions([
        {
          storageKeys: ['users/u1/avatar.webp', 'users/u1/photo-1.webp'],
          counts: { photos: 1 },
        },
        {
          storageKeys: ['market/s1/logo.webp', 'market/s1/l1/a.webp'],
          counts: { listings: 2 },
        },
        { storageKeys: ['notices/n1/a.webp'], counts: { notices: 1 } },
      ]),
    ).toEqual({
      storageKeys: [
        'users/u1/avatar.webp',
        'users/u1/photo-1.webp',
        'market/s1/logo.webp',
        'market/s1/l1/a.webp',
        'notices/n1/a.webp',
      ],
      counts: { photos: 1, listings: 2, notices: 1 },
    });
  });

  it('суммирует одноимённые счётчики разных сервисов', () => {
    expect(
      mergePurgeContributions([
        { storageKeys: [], counts: { images: 2 } },
        { storageKeys: [], counts: { images: 3 } },
      ]).counts,
    ).toEqual({ images: 5 });
  });

  it('пропускает внешние URL демо-данных', () => {
    expect(
      mergePurgeContributions([
        {
          storageKeys: [
            'https://cdn.example.com/demo.png',
            'http://cdn.example.com/x.png',
            '/demo/photo.png',
            'users/u1/real.webp',
          ],
        },
      ]).storageKeys,
    ).toEqual(['users/u1/real.webp']);
  });

  it('не удаляет один и тот же объект дважды', () => {
    expect(
      mergePurgeContributions([
        { storageKeys: ['users/u1/shared.webp'] },
        { storageKeys: ['users/u1/shared.webp', 'users/u1/other.webp'] },
      ]).storageKeys,
    ).toEqual(['users/u1/shared.webp', 'users/u1/other.webp']);
  });

  it('переживает подписчика, вернувшего мусор', () => {
    expect(
      mergePurgeContributions([
        undefined,
        null,
        'что-то не то',
        { counts: { listings: 1 } },
        { storageKeys: ['users/u1/a.webp', 42, ''] },
      ]),
    ).toEqual({ storageKeys: ['users/u1/a.webp'], counts: {} });
  });

  it('у пустого аккаунта пустой план', () => {
    expect(mergePurgeContributions([])).toEqual({
      storageKeys: [],
      counts: {},
    });
  });
});

describe('isDirectUrl', () => {
  it.each(['/demo/a.png', 'http://a/b.png', 'https://a/b.png'])(
    'опознаёт внешний адрес %s',
    (value) => {
      expect(isDirectUrl(value)).toBe(true);
    },
  );

  it('относительный ключ внешним не считает', () => {
    expect(isDirectUrl('users/u1/a.webp')).toBe(false);
  });
});

describe('isPurgeConfirmed', () => {
  it('принимает точный email', () => {
    expect(isPurgeConfirmed('user@example.com', 'user@example.com')).toBe(true);
  });

  it('прощает регистр и пробелы', () => {
    expect(isPurgeConfirmed('  User@Example.COM ', 'user@example.com')).toBe(
      true,
    );
  });

  it('отклоняет чужой email', () => {
    expect(isPurgeConfirmed('other@example.com', 'user@example.com')).toBe(
      false,
    );
  });

  it('отклоняет пустое подтверждение', () => {
    expect(isPurgeConfirmed(undefined, 'user@example.com')).toBe(false);
    expect(isPurgeConfirmed('', 'user@example.com')).toBe(false);
  });
});
