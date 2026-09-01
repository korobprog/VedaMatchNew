import { changedProfileFields } from './admin-profile-edit';

describe('changedProfileFields', () => {
  it('находит изменённый пол', () => {
    expect(
      changedProfileFields({ gender: null }, { gender: 'female' }),
    ).toEqual(['gender']);
  });

  it('молчит, когда ничего не поменялось', () => {
    const snapshot = {
      name: 'Станислав',
      gender: 'male',
      languages: ['русский'],
      homeLocation: { city: 'Хабаровск', lat: 48.5, lon: 135.1 },
    };
    expect(changedProfileFields(snapshot, { ...snapshot })).toEqual([]);
  });

  it('не считает изменением очистку уже пустого поля', () => {
    expect(
      changedProfileFields({ spiritualName: null }, { spiritualName: '' }),
    ).toEqual([]);
    expect(changedProfileFields({ about: '' }, { about: null })).toEqual([]);
  });

  it('не зависит от порядка ключей в городе', () => {
    expect(
      changedProfileFields(
        { homeLocation: { city: 'Минск', lat: 53.9, lon: 27.5 } },
        { homeLocation: { lon: 27.5, lat: 53.9, city: 'Минск' } },
      ),
    ).toEqual([]);
  });

  it('видит правку города и порядок языков', () => {
    expect(
      changedProfileFields(
        { homeLocation: { city: 'Минск', lat: 53.9, lon: 27.5 } },
        { homeLocation: { city: 'Москва', lat: 55.75, lon: 37.6 } },
      ),
    ).toEqual(['homeLocation']);
    expect(
      changedProfileFields(
        { languages: ['русский', 'английский'] },
        { languages: ['английский', 'русский'] },
      ),
    ).toEqual(['languages']);
  });

  it('перечисляет несколько полей в порядке списка, а не формы', () => {
    expect(
      changedProfileFields(
        { name: 'Андрей', gender: null, about: null },
        { name: 'Андрей дас', gender: 'male', about: 'Йога и служение' },
      ),
    ).toEqual(['name', 'gender', 'about']);
  });
});
