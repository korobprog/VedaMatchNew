import {
  cashFiltersWhere,
  hasCashFilters,
  MAX_BULK_ENTRIES,
  parseCashFilters,
  parseEntryIds,
} from './cash-filters';
import { CashInputError } from './cash-input';
import { parseCashTemplateInput } from './cash-templates';

describe('parseCashFilters', () => {
  it('пустой запрос — фильтров нет', () => {
    const filters = parseCashFilters({ from: '2026-05-01' });
    expect(hasCashFilters(filters)).toBe(false);
    expect(cashFiltersWhere(filters)).toEqual({});
  });

  it('собирает условие по всем полям', () => {
    const filters = parseCashFilters({
      q: ' Кирилл ',
      kind: 'income',
      categoryId: 'cat-1',
      guestId: 'g-1',
      tag: '#Наличные',
      minMinor: '50000',
      maxMinor: '200000',
    });
    expect(hasCashFilters(filters)).toBe(true);
    expect(cashFiltersWhere(filters)).toEqual({
      kind: 'income',
      categoryId: 'cat-1',
      guestId: 'g-1',
      tags: { has: 'наличные' },
      amountMinor: { gte: 50000, lte: 200000 },
      OR: [
        { note: { contains: 'Кирилл', mode: 'insensitive' } },
        { guest: { fullName: { contains: 'Кирилл', mode: 'insensitive' } } },
      ],
    });
  });

  it('«без статьи» ищет пустую статью', () => {
    expect(cashFiltersWhere(parseCashFilters({ categoryId: 'none' }))).toEqual({
      categoryId: null,
    });
  });

  it('одна граница суммы — одно условие', () => {
    expect(cashFiltersWhere(parseCashFilters({ minMinor: '100' }))).toEqual({
      amountMinor: { gte: 100 },
    });
  });

  it('перевёрнутые границы и мусор в сумме — ошибка', () => {
    expect(() =>
      parseCashFilters({ minMinor: '500', maxMinor: '100' }),
    ).toThrow('больше');
    expect(() => parseCashFilters({ minMinor: '8,50' })).toThrow(
      CashInputError,
    );
  });

  it('неизвестный вид — ошибка', () => {
    expect(() => parseCashFilters({ kind: 'transfer' })).toThrow(
      CashInputError,
    );
  });
});

describe('parseEntryIds', () => {
  it('убирает повторы и пустые', () => {
    expect(parseEntryIds(['a', 'a', '', 5, 'b'])).toEqual(['a', 'b']);
  });

  it('пустой список и не список — ошибка', () => {
    expect(() => parseEntryIds([])).toThrow('ни одной');
    expect(() => parseEntryIds('a')).toThrow('список');
  });

  it('ограничивает размер', () => {
    const ids = Array.from({ length: MAX_BULK_ENTRIES + 1 }, (_, i) => `e${i}`);
    expect(() => parseEntryIds(ids)).toThrow(CashInputError);
  });
});

describe('parseCashTemplateInput', () => {
  it('шаблон с суммой', () => {
    expect(
      parseCashTemplateInput({
        name: ' Проживание сутки ',
        kind: 'income',
        amountMinor: 85000,
        categoryId: 'cat-1',
        note: '',
        tags: ['Наличные'],
      }),
    ).toEqual({
      name: 'Проживание сутки',
      kind: 'income',
      amountMinor: 85000,
      categoryId: 'cat-1',
      note: '',
      tags: ['наличные'],
    });
  });

  it('без суммы — можно: у закупки она каждый раз своя', () => {
    expect(
      parseCashTemplateInput({ name: 'Продукты', kind: 'expense' }).amountMinor,
    ).toBeNull();
  });

  it('нулевая сумма и пустое название — ошибка', () => {
    expect(() =>
      parseCashTemplateInput({ name: 'X', kind: 'expense', amountMinor: 0 }),
    ).toThrow(CashInputError);
    expect(() =>
      parseCashTemplateInput({ name: ' ', kind: 'expense' }),
    ).toThrow('название');
  });
});
