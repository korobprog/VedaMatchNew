import {
  acceptLanguage,
  directoryNeedle,
  geoQueryVariants,
  hasCyrillic,
  transliterate,
} from './geo-query';

describe('hasCyrillic', () => {
  it('находит кириллицу', () => {
    expect(hasCyrillic('Маяпур')).toBe(true);
    expect(hasCyrillic('Нижний Новгород')).toBe(true);
  });

  it('не срабатывает на латинице и цифрах', () => {
    expect(hasCyrillic('Mayapur')).toBe(false);
    expect(hasCyrillic('São Paulo')).toBe(false);
    expect(hasCyrillic('123')).toBe(false);
  });
});

describe('transliterate', () => {
  it('переводит название так, как его пишут в OSM', () => {
    expect(transliterate('Маяпур')).toBe('Mayapur');
    expect(transliterate('Вриндаван')).toBe('Vrindavan');
  });

  // «х» → «kh» верно для русских топонимов (Харьков), но ломает санскритские
  // «дх», «тх», «бх»: «Говардхан» становится «Govardkhan». Такие имена и
  // держит словарь PLACE_ALIASES — транслитерация их не спасёт.
  it('промахивается на санскритских сочетаниях — их закрывает словарь', () => {
    expect(transliterate('Говардхан')).toBe('Govardkhan');
    expect(geoQueryVariants('Говардхан')).toContain('Govardhan');
  });

  it('сохраняет регистр первой буквы, а не всей замены', () => {
    expect(transliterate('Харьков')).toBe('Kharkov');
    expect(transliterate('Щёлково')).toBe('Schelkovo');
  });

  it('сохраняет пробелы, дефисы и латиницу', () => {
    expect(transliterate('Нижний Новгород')).toBe('Nizhniy Novgorod');
    expect(transliterate('Ростов-на-Дону')).toBe('Rostov-na-Donu');
    expect(transliterate('Mayapur')).toBe('Mayapur');
  });

  it('выбрасывает мягкий и твёрдый знак', () => {
    expect(transliterate('Тверь')).toBe('Tver');
    expect(transliterate('подъезд')).toBe('podezd');
  });
});

describe('geoQueryVariants', () => {
  // Порядок и есть цена вопроса: геокодер зовут по очереди до первого
  // непустого ответа, поэтому «Москва» находится с первой попытки, а
  // латинский запасной вариант остаётся неоплаченным.
  it('русский город идёт первым, транслитерация — запасной вариант', () => {
    expect(geoQueryVariants('Москва')).toEqual(['Москва', 'Moskva']);
  });

  it('латиница не транслитерируется', () => {
    expect(geoQueryVariants('Mayapur')).toEqual(['Mayapur']);
  });

  it('святое место добавляет имя из словаря перед транслитерацией', () => {
    expect(geoQueryVariants('Маяпур')).toEqual(['Маяпур', 'Mayapur']);
  });

  it('словарь выигрывает у транслитерации, когда та промахивается', () => {
    expect(geoQueryVariants('Калькутта')).toEqual([
      'Калькутта',
      'Kolkata',
      'Kalkutta',
    ]);
  });

  it('словарь нечувствителен к регистру', () => {
    expect(geoQueryVariants('маяпур')).toContain('Mayapur');
  });

  it('пустой запрос не даёт вариантов', () => {
    expect(geoQueryVariants('   ')).toEqual([]);
  });

  it('обрезает пробелы по краям', () => {
    expect(geoQueryVariants('  Москва  ')).toEqual(['Москва', 'Moskva']);
  });
});

describe('acceptLanguage', () => {
  it('английскому интерфейсу отдаёт английские названия', () => {
    expect(acceptLanguage('en')).toBe('en');
    expect(acceptLanguage('en-US')).toBe('en');
  });

  it('русскому — русские с запасом на английский', () => {
    expect(acceptLanguage('ru')).toBe('ru,en');
  });

  it('без языка и на мусоре не падает', () => {
    expect(acceptLanguage(undefined)).toBe('ru,en');
    expect(acceptLanguage('')).toBe('ru,en');
    expect(acceptLanguage('zz')).toBe('ru,en');
  });
});

describe('directoryNeedle', () => {
  it('ищет по началу написания', () => {
    expect(directoryNeedle('Мая')).toBe('мая%');
  });

  it('приводит регистр — алиасы лежат в нижнем', () => {
    expect(directoryNeedle('МАЯПУР')).toBe('маяпур%');
  });

  it('«ё» и «е» человек путает — сравниваем через «е»', () => {
    expect(directoryNeedle('Кишинёв')).toBe('кишинев%');
  });

  it('обрезает пробелы по краям', () => {
    expect(directoryNeedle('  Москва ')).toBe('москва%');
  });

  // Без экранирования «%» вернул бы весь справочник, а «_» — любой город
  // из одной буквы плюс остаток.
  it('экранирует подстановочные знаки LIKE', () => {
    expect(directoryNeedle('%')).toBe('\\%%');
    expect(directoryNeedle('a_b')).toBe('a\\_b%');
    expect(directoryNeedle('a\\b')).toBe('a\\\\b%');
  });
});
