import { foldName, matchesContactQuery } from './work-contacts-search';

describe('foldName', () => {
  it('складывает регистр, ё и лишние пробелы', () => {
    expect(foldName('  Артём   Мещеряков ')).toBe('артем мещеряков');
  });
});

describe('matchesContactQuery', () => {
  const artem = { name: 'Артём Мещеряков', spiritualName: null };

  // Ровно то, на чём поиск ломался: на телефоне ё не набирают.
  it('находит Артёма по «артем»', () => {
    expect(matchesContactQuery(artem, 'артем')).toBe(true);
  });

  it('находит и по ё, если её всё-таки набрали', () => {
    expect(matchesContactQuery(artem, 'Артём')).toBe(true);
  });

  it('ищет по фамилии и по любой части имени', () => {
    expect(matchesContactQuery(artem, 'мещеряков')).toBe(true);
    expect(matchesContactQuery(artem, 'щеря')).toBe(true);
  });

  it('находит по духовному имени', () => {
    expect(
      matchesContactQuery(
        { name: 'Артём Мещеряков', spiritualName: 'Ачьюта дас' },
        'ачьюта',
      ),
    ).toBe(true);
  });

  it('пустой запрос пропускает всех', () => {
    expect(matchesContactQuery(artem, '   ')).toBe(true);
  });

  it('чужое имя не находит', () => {
    expect(matchesContactQuery(artem, 'борис')).toBe(false);
  });
});
