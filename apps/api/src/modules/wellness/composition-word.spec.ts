import {
  NO_COMPOSITION_WORD_MESSAGE,
  hasCompositionWord,
  stripCompositionWord,
} from './composition-word';

describe('hasCompositionWord', () => {
  it.each([
    'Состав: вода, сахар',
    'СОСТАВ: ВОДА, САХАР',
    'состав продукта: мука пшеничная',
    'В составе: молоко, соль',
    'Ингредиенты: вода',
    'INGREDIENTS: water, sugar',
    'Склад: борошно пшеничне', // украинская упаковка
    'Састаў: мука, соль', // белорусская
  ])('«%s» — заголовок найден', (text) => {
    expect(hasCompositionWord(text)).toBe(true);
  });

  it.each([
    '',
    'Пищевая ценность на 100 г: белки 5 г',
    'Годен до 12.03.2027',
    'Изготовлено по ТУ 9123-001',
    'вода, сахар, соль',
  ])('«%s» — заголовка нет', (text) => {
    expect(hasCompositionWord(text)).toBe(false);
  });

  it('совпадение по началу слова, а не по подстроке', () => {
    // «составной» и «складской» — не заголовки состава.
    expect(hasCompositionWord('несоставной продукт')).toBe(false);
    expect(hasCompositionWord('складской учёт')).toBe(true); // «склад» с начала слова
    expect(hasCompositionWord('отгрузка со склада')).toBe(true);
  });

  it('«ё» и лишние пробелы не мешают', () => {
    expect(hasCompositionWord('  СоСтАв   :  вода ')).toBe(true);
  });

  it('объяснение отказа названо словами и подсказывает, что делать', () => {
    expect(NO_COMPOSITION_WORD_MESSAGE).toContain('Состав');
    expect(NO_COMPOSITION_WORD_MESSAGE).toContain('сфотографируйте');
  });
});

describe('stripCompositionWord', () => {
  it('убирает заголовок из начала', () => {
    expect(stripCompositionWord('Состав: вода, сахар')).toBe('вода, сахар');
    expect(stripCompositionWord('ИНГРЕДИЕНТЫ — вода')).toBe('вода');
    expect(stripCompositionWord('Состав продукта: мука')).toBe('мука');
    expect(stripCompositionWord('Склад: борошно')).toBe('борошно');
  });

  it('не трогает слово посреди строки', () => {
    // «Состав может меняться» — оговорка производителя внутри состава.
    expect(stripCompositionWord('вода, сахар. Состав может меняться')).toBe(
      'вода, сахар. Состав может меняться',
    );
  });

  it('снимает кавычки, которыми модель любит обрамлять ответ', () => {
    expect(stripCompositionWord('«Состав: вода»')).toBe('вода');
  });

  it('строку без заголовка оставляет как есть', () => {
    expect(stripCompositionWord('вода, сахар')).toBe('вода, сахар');
  });

  it('пустую строку не ломает', () => {
    expect(stripCompositionWord('')).toBe('');
  });
});
