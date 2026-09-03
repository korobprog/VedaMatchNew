import { PERSONAL_FIELDS, toPersonalRecord } from './personal-fields';

const user = {
  id: 'u1',
  email: 'ivan@yandex.ru',
  name: 'Иван Петров',
  spiritualName: 'Ишвара дас',
  birthDate: new Date('1990-05-17'),
  gender: 'male' as const,
  avatarKey: 'avatars/u1.jpg',
  // Ниже — то, что в московскую базу попадать НЕ должно.
  about: 'Рассказ о себе',
  languages: ['ru', 'en'],
  role: 'user',
  passwordHash: 'scrypt$...',
};

describe('PERSONAL_FIELDS', () => {
  it('содержит ровно то, что идентифицирует человека', () => {
    // Список сверяется целиком, а не «содержит»: расширение границы контура
    // должно быть осознанной правкой, а не побочным следствием.
    expect([...PERSONAL_FIELDS]).toEqual([
      'id',
      'email',
      'name',
      'spiritualName',
      'birthDate',
      'gender',
      'avatarKey',
    ]);
  });
});

describe('toPersonalRecord', () => {
  it('переносит только поля из перечня', () => {
    const record = toPersonalRecord(user, []);

    expect(Object.keys(record).sort()).toEqual(
      ['avatarKey', 'birthDate', 'email', 'gender', 'id', 'name', 'photoKeys', 'spiritualName'].sort(),
    );
  });

  it('не выносит за контур то, чего в перечне нет', () => {
    const record = toPersonalRecord(user, []) as Record<string, unknown>;

    expect(record.about).toBeUndefined();
    expect(record.languages).toBeUndefined();
    expect(record.role).toBeUndefined();
    expect(record.passwordHash).toBeUndefined();
  });

  it('переносит ключи фотографий', () => {
    expect(toPersonalRecord(user, ['photos/a.jpg', 'photos/b.jpg']).photoKeys).toEqual([
      'photos/a.jpg',
      'photos/b.jpg',
    ]);
  });

  it('гендер отдаёт строкой: в московской схеме он не энум', () => {
    expect(typeof toPersonalRecord(user, []).gender).toBe('string');
    expect(toPersonalRecord({ ...user, gender: null }, []).gender).toBeNull();
  });
});
