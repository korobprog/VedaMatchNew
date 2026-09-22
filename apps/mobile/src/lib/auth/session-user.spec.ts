import { toSessionUser } from './session-user';

/**
 * Сборка пользователя сессии из `GET /users/me`. Раньше она была скопирована
 * в трёх местах (токены, cookie портала, мини-приложение Telegram); тест
 * сторожит именно то, ради чего её свели в одну функцию, — что поля VED-333
 * доезжают до сессии, иначе онбординг не покажется вовсе.
 */
describe('toSessionUser', () => {
  const base = { id: 'u-1', email: 'a@b.ru', name: 'Максим' };

  it('берёт пол, этап пути и линию — по ним решается, нужен ли онбординг', () => {
    const user = toSessionUser({ ...base, gender: 'male', spiritualStage: 'devotee', lineage: 'iskcon' });
    expect(user).toMatchObject({ gender: 'male', spiritualStage: 'devotee', lineage: 'iskcon' });
  });

  it('отсутствующие поля читает как «не заполнено», а не как undefined', () => {
    const user = toSessionUser(base);
    expect(user.gender).toBeNull();
    expect(user.spiritualStage).toBeNull();
    expect(user.lineage).toBeNull();
    expect(user.spiritualName).toBeNull();
    expect(user.avatarUrl).toBeNull();
  });

  it('наружу показывает духовное имя, когда оно есть', () => {
    expect(toSessionUser({ ...base, spiritualName: 'Мадхава дас' }).displayName).toBe('Мадхава дас');
    expect(toSessionUser(base).displayName).toBe('Максим');
  });

  it('готовый displayName сервера сильнее подстраховки', () => {
    expect(toSessionUser({ ...base, spiritualName: 'Мадхава дас', displayName: 'Своё' }).displayName).toBe('Своё');
  });
});
