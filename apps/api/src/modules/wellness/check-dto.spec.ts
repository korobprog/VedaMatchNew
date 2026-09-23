import { isCheckReason, parseStoredSources, toCheckDto } from './check-dto';

const row = {
  status: 'review' as const,
  reasons: ['too_few_sources', 'устаревший_код'],
  submittedName: 'Нутелла',
  submittedBrand: null,
  submittedIngredients: 'сахар',
  aiFound: true,
  aiNotFood: false,
  aiName: 'Nutella',
  aiBrand: 'Ferrero',
  aiIngredients: 'сахар, фундук',
  aiConflicts: [],
  sources: [
    {
      url: 'https://shop.ru/p',
      title: 'Nutella',
      confirmsProduct: true,
      confirmsIngredients: true,
      level: 'verified',
      ingredientsOnPage: true,
    },
  ],
  attemptCount: 1,
  costUsdMicros: 109_225,
  finishedAt: new Date('2026-09-23T10:00:00.000Z'),
};

describe('toCheckDto', () => {
  it('отдаёт модератору присланное, предложенное, источники и стоимость', () => {
    expect(toCheckDto(row)).toEqual({
      status: 'review',
      reasons: ['too_few_sources'],
      submitted: { name: 'Нутелла', brand: null, ingredientsRaw: 'сахар' },
      proposal: {
        found: true,
        notFood: false,
        name: 'Nutella',
        brand: 'Ferrero',
        ingredientsRaw: 'сахар, фундук',
        conflicts: [],
      },
      sources: row.sources,
      attemptCount: 1,
      costUsd: 0.109225,
      finishedAt: '2026-09-23T10:00:00.000Z',
    });
  });

  it('незаконченная проверка — без даты', () => {
    expect(toCheckDto({ ...row, finishedAt: null }).finishedAt).toBeNull();
  });
});

describe('parseStoredSources', () => {
  it.each([null, 'строка', {}, 5])('не список (%p) — пусто', (value) => {
    expect(parseStoredSources(value)).toEqual([]);
  });

  it('битые элементы выбрасываются, незнакомый уровень — самый низкий', () => {
    expect(
      parseStoredSources([
        null,
        { title: 'без адреса' },
        { url: 'https://a.ru/p', level: 'trusted', confirmsProduct: 'да' },
      ]),
    ).toEqual([
      {
        url: 'https://a.ru/p',
        title: '',
        confirmsProduct: false,
        confirmsIngredients: false,
        level: 'claimed',
        ingredientsOnPage: false,
      },
    ]);
  });
});

describe('isCheckReason', () => {
  it('знает свои коды и не знает чужих', () => {
    expect(isCheckReason('not_found')).toBe(true);
    expect(isCheckReason('not_food')).toBe(true);
    expect(isCheckReason('found')).toBe(false);
  });
});
