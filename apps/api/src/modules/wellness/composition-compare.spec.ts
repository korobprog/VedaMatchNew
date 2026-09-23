import {
  catalogFingerprint,
  compositionAgreement,
  compositionCoverage,
  compositionTokens,
  differsMeaningfully,
  sameFingerprint,
  sameProductName,
} from './composition-compare';

describe('compositionTokens', () => {
  it('приводит регистр и «ё», отбрасывает цифры, проценты и служебные слова', () => {
    expect([
      ...compositionTokens('Состав: Сахар 20%, МАСЛО пальмовое, ёмкость. Может содержать следы'),
    ]).toEqual(['сахар', 'масло', 'пальмовое', 'емкость']);
  });

  it('короткие слова не различают составы и выбрасываются', () => {
    expect([...compositionTokens('соль, E330, и, по')]).toEqual(['соль']);
  });
});

describe('compositionAgreement', () => {
  it('один состав с опечатками распознавания и другой пунктуацией — почти 1', () => {
    const photo = 'сахар, масло пальмовое, фундук 13%, какао обезжиренное 7.4%, молоко сухое обезжиренное 6.6%, эмульгатор лецитин соевый, ванилин';
    const page = 'Сахар; масло пальмовое; фундук (13 %); какао обезжиренное (7,4%); молоко сухое обезжиренное; эмульгатор: лецитин (соевый); ванилин.';
    expect(compositionAgreement(photo, page)).toBeGreaterThan(0.95);
  });

  it('разные продукты — далеко от порога', () => {
    expect(
      compositionAgreement(
        'мука пшеничная, вода, дрожжи, соль',
        'молоко нормализованное, закваска',
      ),
    ).toBe(0);
  });

  it('пустой состав с любой стороны — ноль, а не «совпало»', () => {
    expect(compositionAgreement('', 'сахар')).toBe(0);
    expect(compositionAgreement('сахар', '   ')).toBe(0);
    expect(compositionAgreement('', '')).toBe(0);
  });

  it('считается по Дайсу: половина общих слов при равных списках — 0.5', () => {
    expect(compositionAgreement('сахар соль', 'сахар мука')).toBe(0.5);
  });
});

describe('compositionCoverage', () => {
  it('доля слов состава, найденных на длинной странице', () => {
    const page = 'Купить пасту. Состав: сахар, масло пальмовое, фундук. Доставка завтра.';
    expect(compositionCoverage(page, 'сахар, масло пальмовое, фундук')).toBe(1);
    expect(compositionCoverage(page, 'сахар, желатин')).toBe(0.5);
  });

  it('пустой состав ничем не покрыт', () => {
    expect(compositionCoverage('любая страница', '')).toBe(0);
  });
});

describe('sameProductName', () => {
  it('короткое название человека и длинное из магазина — один товар', () => {
    expect(sameProductName('Нутелла', 'Паста ореховая Нутелла 350 г')).toBe(true);
  });

  it('общее значимое слово — достаточно', () => {
    expect(sameProductName('Хлебцы гречневые', 'Гречневые хлебцы Dr. Korner')).toBe(true);
  });

  it('совсем разные слова — повод подозревать чужой штрихкод', () => {
    expect(sameProductName('Кефир 1%', 'Шоколад молочный')).toBe(false);
  });

  it('пустое название не совпадает ни с чем', () => {
    expect(sameProductName('', 'Кефир')).toBe(false);
  });
});

describe('differsMeaningfully', () => {
  it('регистр и пробелы — не уточнение', () => {
    expect(differsMeaningfully('Паста  НУТЕЛЛА', 'паста нутелла')).toBe(false);
  });

  it('новое слово — уточнение', () => {
    expect(differsMeaningfully('Нутелла', 'Nutella Нутелла')).toBe(true);
  });

  it('пустое против заполненного — уточнение', () => {
    expect(differsMeaningfully(null, 'Ferrero')).toBe(true);
  });
});

describe('catalogFingerprint', () => {
  const match = (key: string, severity: string) => ({
    entry: { key },
    severity,
  });

  it('сортирует и убирает повторы: порядок в составе не важен', () => {
    expect(
      catalogFingerprint([
        match('onion', 'contains'),
        match('e120', 'contains'),
        match('onion', 'contains'),
      ]),
    ).toEqual(['e120:contains', 'onion:contains']);
  });

  it('та же запись с другой серьёзностью — другой отпечаток', () => {
    expect(
      sameFingerprint(
        catalogFingerprint([match('milk', 'contains')]),
        catalogFingerprint([match('milk', 'mayContain')]),
      ),
    ).toBe(false);
  });

  it('равные отпечатки совпадают, лишняя запись — нет', () => {
    expect(sameFingerprint(['a:contains'], ['a:contains'])).toBe(true);
    expect(sameFingerprint(['a:contains'], ['a:contains', 'b:hidden'])).toBe(false);
  });
});
