import { placeSlug } from './travel-admin.service';

describe('placeSlug', () => {
  it('переводит русское название в латиницу', () => {
    expect(placeSlug('Маяпур')).toBe('mayapur');
    expect(placeSlug('Нижний Новгород')).toBe('nizhniy-novgorod');
  });

  it('схлопывает знаки препинания в один дефис', () => {
    expect(placeSlug('Санкт-Петербург, Купчино')).toBe(
      'sankt-peterburg-kupchino',
    );
  });

  it('не оставляет дефисов по краям', () => {
    expect(placeSlug('  Гоа!  ')).toBe('goa');
  });

  it('латиницу оставляет как есть', () => {
    expect(placeSlug('New Vrindaban')).toBe('new-vrindaban');
  });

  it('не отдаёт пустой слаг: у названия из одних знаков есть запасной', () => {
    expect(placeSlug('!!!')).toBe('place');
  });
});
