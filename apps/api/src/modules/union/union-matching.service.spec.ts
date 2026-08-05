import {
  UnionMatchingService,
  UnionMatchInput,
} from './union-matching.service';

function input(overrides: Partial<UnionMatchInput> = {}): UnionMatchInput {
  return {
    intentions: [{ type: 'family', weight: 100 }],
    spiritualStage: 'devotee',
    interests: [],
    values: [],
    city: null,
    country: null,
    lat: null,
    lon: null,
    relocationReady: false,
    format: 'any',
    diet: null,
    regulativePrinciples: [],
    ...overrides,
  };
}

describe('UnionMatchingService', () => {
  const service = new UnionMatchingService();

  function lifestyle(me: UnionMatchInput, other: UnionMatchInput): number {
    const item = service
      .computeCompatibility(me, other)
      .breakdown.find((row) => row.criterion === 'lifestyle');
    if (!item) throw new Error('нет критерия lifestyle');
    return item.score;
  }

  it('веса критериев в сумме дают 100', () => {
    const { breakdown } = service.computeCompatibility(input(), input());
    const sum = breakdown.reduce((total, row) => total + row.weight, 0);
    expect(sum).toBe(100);
  });

  it('образ жизни нейтрален, пока поля не заполнены', () => {
    expect(lifestyle(input(), input())).toBe(50);
  });

  it('одинаковое питание и принципы дают максимум', () => {
    const same = {
      diet: 'vegetarian' as const,
      regulativePrinciples: ['no_meat' as const, 'no_intoxicants' as const],
    };
    expect(lifestyle(input(same), input(same))).toBe(100);
  });

  it('разное отношение к мясу резко снижает оценку', () => {
    expect(
      lifestyle(
        input({ diet: 'vegetarian' }),
        input({ diet: 'not_vegetarian' }),
      ),
    ).toBe(35); // (20 + нейтральные 50) / 2
  });

  it('вегетарианство и веганство считаются близкими', () => {
    expect(
      lifestyle(input({ diet: 'vegetarian' }), input({ diet: 'vegan' })),
    ).toBe(65); // (80 + нейтральные 50) / 2
  });

  it('«четыре принципа против одного» снижает оценку', () => {
    const strict = input({
      regulativePrinciples: [
        'no_meat',
        'no_intoxicants',
        'no_gambling',
        'no_illicit_sex',
      ],
    });
    const relaxed = input({ regulativePrinciples: ['no_meat'] });
    // Совпал один принцип из четырёх: 25 за принципы, питание нейтрально.
    expect(lifestyle(strict, relaxed)).toBe(38);
  });

  it('незаполненные принципы не штрафуют', () => {
    const strict = input({
      regulativePrinciples: ['no_meat', 'no_intoxicants'],
    });
    expect(lifestyle(strict, input())).toBe(50);
  });

  it('итог остаётся в пределах 0..100', () => {
    const total = service.computeCompatibility(
      input({ diet: 'vegan', regulativePrinciples: ['no_meat'] }),
      input({ diet: 'not_vegetarian', regulativePrinciples: ['no_gambling'] }),
    ).total;
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(100);
  });
});
