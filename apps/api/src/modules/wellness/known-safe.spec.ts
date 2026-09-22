import { dropKnownSafe, isKnownSafe, KNOWN_SAFE_COUNT } from './known-safe';
import { parseComposition } from './ingredient-parse';

describe('isKnownSafe', () => {
  it.each([
    'вода',
    'вода питьевая подготовленная',
    'мука пшеничная хлебопекарная высшего сорта',
    'масло подсолнечное рафинированное дезодорированное',
    'соль поваренная пищевая',
    'лимонная кислота',
    'e330',
  ])('«%s» — понятно и безвредно', (text) => {
    expect(isKnownSafe(text)).toBe(true);
  });

  it.each([
    // Главное правило списка: без уточнения источника — не безвредно.
    'масло',
    'жир',
    'ароматизатор',
    'специи',
    'эмульгатор',
    'моно- и диглицериды',
    'желатин',
    'лук',
    'чеснок',
    'сычужный фермент',
  ])('«%s» — в списке безвредного не значится', (text) => {
    expect(isKnownSafe(text)).toBe(false);
  });

  it('совпадение только по целому слову', () => {
    // «соль» внутри «сольвент», «рис» внутри «рисовать» — именно эта ошибка
    // и заставила искать по границам слов в `ingredient-match.ts`.
    expect(isKnownSafe('сольвент')).toBe(false);
    expect(isKnownSafe('рисовать')).toBe(false);
    expect(isKnownSafe('водоросли')).toBe(false);
  });

  it('список непустой — сломанный импорт не должен выглядеть как «ничего не безвредно»', () => {
    expect(KNOWN_SAFE_COUNT).toBeGreaterThanOrEqual(100);
  });
});

describe('dropKnownSafe', () => {
  function unknownAfter(composition: string, unrecognized: string[]) {
    return dropKnownSafe(parseComposition(composition), unrecognized);
  }

  it('убирает из непонятого понятное', () => {
    const composition = 'мука пшеничная, вода, соль';
    const tokens = parseComposition(composition);
    const raw = tokens.map((token) => token.raw);
    expect(dropKnownSafe(tokens, raw)).toEqual([]);
  });

  it('незнакомое оставляет как было', () => {
    expect(
      unknownAfter('вода, дигидрокверцетин', ['вода', 'дигидрокверцетин']),
    ).toEqual(['дигидрокверцетин']);
  });

  it('сравнивает приведённый текст, а не кусок этикетки', () => {
    // На этикетке «Мука пшеничная» с большой буквы; в `unrecognized` лежит
    // именно такой `raw`, и сравнение по нему напрямую не сработало бы.
    const composition = 'Состав: Мука пшеничная, ВОДА';
    const tokens = parseComposition(composition);
    expect(
      dropKnownSafe(
        tokens,
        tokens.map((token) => token.raw),
      ),
    ).toEqual([]);
  });

  it('пустой список непонятого остаётся пустым', () => {
    expect(unknownAfter('вода', [])).toEqual([]);
  });
});
