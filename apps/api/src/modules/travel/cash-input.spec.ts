import { cashBalance, DEFAULT_CASH_CATEGORIES } from './cash-book';
import {
  CashInputError,
  MAX_CASH_AMOUNT_MINOR,
  MAX_CASH_TAGS,
  normalizeTags,
  parseCashCategoryInput,
  parseCashEntryInput,
  parseCashRange,
  parseOpeningMinor,
} from './cash-input';

const valid = {
  kind: 'income',
  amountMinor: 85_000,
  occurredOn: '2026-05-20',
  categoryId: 'cat-1',
  note: '  Кэлин Вячеслав  ',
  tags: ['#Хостел', 'хостел', ' оплата '],
};

describe('parseCashEntryInput', () => {
  it('разбирает запись и чистит заметку и теги', () => {
    const input = parseCashEntryInput(valid);
    expect(input).toEqual({
      kind: 'income',
      amountMinor: 85_000,
      occurredOn: new Date(Date.UTC(2026, 4, 20)),
      categoryId: 'cat-1',
      note: 'Кэлин Вячеслав',
      tags: ['хостел', 'оплата'],
    });
  });

  it('без статьи — null, а не пустая строка', () => {
    expect(parseCashEntryInput({ ...valid, categoryId: '  ' }).categoryId).toBe(
      null,
    );
  });

  it.each([0, -100, 12.5, '850', null])(
    'не принимает сумму %p',
    (amountMinor) => {
      expect(() => parseCashEntryInput({ ...valid, amountMinor })).toThrow(
        CashInputError,
      );
    },
  );

  it('ловит лишние нули', () => {
    expect(() =>
      parseCashEntryInput({ ...valid, amountMinor: MAX_CASH_AMOUNT_MINOR + 1 }),
    ).toThrow('проверьте нули');
  });

  it('не принимает неизвестный вид записи', () => {
    expect(() => parseCashEntryInput({ ...valid, kind: 'transfer' })).toThrow(
      'доход это или расход',
    );
  });

  it('не принимает несуществующую дату', () => {
    expect(() =>
      parseCashEntryInput({ ...valid, occurredOn: '2026-02-30' }),
    ).toThrow(CashInputError);
  });

  it('разрешает прошлые даты: касса ведётся и задним числом', () => {
    expect(
      parseCashEntryInput({ ...valid, occurredOn: '2020-01-01' }).occurredOn,
    ).toEqual(new Date(Date.UTC(2020, 0, 1)));
  });
});

describe('normalizeTags', () => {
  it('пропускает пустые и нестроковые', () => {
    expect(normalizeTags(['', '#', 5, 'ok'])).toEqual(['ok']);
  });

  it('ограничивает число тегов', () => {
    const many = Array.from({ length: MAX_CASH_TAGS + 1 }, (_, i) => `t${i}`);
    expect(() => normalizeTags(many)).toThrow(CashInputError);
  });

  it('не принимает строку вместо списка', () => {
    expect(() => normalizeTags('ремонт')).toThrow('списком');
  });
});

describe('parseCashCategoryInput', () => {
  it('разбирает статью', () => {
    expect(
      parseCashCategoryInput({
        kind: 'expense',
        name: ' Ремонт ',
        icon: 'repair',
      }),
    ).toEqual({ kind: 'expense', name: 'Ремонт', icon: 'repair' });
  });

  it('не принимает значок не из списка', () => {
    expect(() =>
      parseCashCategoryInput({
        kind: 'expense',
        name: 'Ремонт',
        icon: 'Hammer',
      }),
    ).toThrow('значок');
  });

  it('требует название', () => {
    expect(() =>
      parseCashCategoryInput({ kind: 'expense', name: ' ', icon: 'repair' }),
    ).toThrow('название');
  });
});

describe('parseOpeningMinor', () => {
  it('принимает долг', () => {
    expect(parseOpeningMinor(-5000)).toBe(-5000);
  });

  it('не принимает дробь', () => {
    expect(() => parseOpeningMinor(1.5)).toThrow(CashInputError);
  });
});

describe('parseCashRange', () => {
  const today = new Date('2026-05-20T21:30:00Z');

  it('по умолчанию — последний 31 день по сегодняшний', () => {
    expect(parseCashRange(undefined, undefined, today)).toEqual({
      from: new Date(Date.UTC(2026, 3, 20)),
      to: new Date(Date.UTC(2026, 4, 20)),
    });
  });

  it('одна дата — это промежуток в один день', () => {
    const range = parseCashRange('2026-05-18', '2026-05-18', today);
    expect(range.from).toEqual(range.to);
  });

  it('не принимает перевёрнутый промежуток', () => {
    expect(() => parseCashRange('2026-05-19', '2026-05-18', today)).toThrow(
      'позже конца',
    );
  });

  it('не принимает промежуток длиннее трёх лет', () => {
    expect(() => parseCashRange('2020-01-01', '2026-01-01', today)).toThrow(
      'длинный',
    );
  });
});

describe('cashBalance', () => {
  it('складывает доходы и вычитает расходы от начального остатка', () => {
    expect(
      cashBalance(6_809_900, [
        { kind: 'income', amountMinor: 340_000 },
        { kind: 'expense', amountMinor: 0 },
      ]),
    ).toBe(7_149_900);
  });

  it('пустая сумма группы — ноль', () => {
    expect(cashBalance(100, [{ kind: 'expense', amountMinor: null }])).toBe(
      100,
    );
  });
});

describe('DEFAULT_CASH_CATEGORIES', () => {
  it('названия уникальны в пределах вида — иначе упадёт уникальный индекс', () => {
    const keys = DEFAULT_CASH_CATEGORIES.map((c) => `${c.kind}:${c.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
