import { resolveVerdict, type WellnessDietRestrictions } from './diet-verdict';
import {
  matchIngredients,
  type WellnessIngredientEntry,
} from './ingredient-match';
import { parseComposition } from './ingredient-parse';

// Файл сида — обычный CommonJS: его читает `seed.cjs`, и переводить его в
// модуль ради одного теста значило бы ломать сид.
const { wellnessIngredients } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../prisma/wellness-ingredients-data.js') as {
    wellnessIngredients: WellnessIngredientEntry[];
  };

/**
 * Справочник из сида, прогнанный через весь движок на настоящих текстах с
 * упаковок.
 *
 * Отдельные тесты разбора и вердикта работают на выдуманных справочниках и
 * поэтому зелены даже тогда, когда в сиде забыли алиас. Здесь проверяется то,
 * что человек получит на самом деле: без этого теста «желатин» мог бы
 * потеряться между двумя зелёными наборами.
 */
const VAISHNAVA: WellnessDietRestrictions = {
  excluded: [
    'meat',
    'fish',
    'egg',
    'gelatin',
    'rennet',
    'onion',
    'garlic',
    'mushroom',
  ],
  excludedKeys: [],
};

const VEGETARIAN: WellnessDietRestrictions = {
  excluded: ['meat', 'fish', 'gelatin', 'rennet'],
  excludedKeys: [],
};

function check(label: string, restrictions: WellnessDietRestrictions) {
  const { matches, unrecognized } = matchIngredients(
    parseComposition(label),
    wellnessIngredients,
  );
  return resolveVerdict(matches, unrecognized, restrictions);
}

const keys = (result: ReturnType<typeof check>) =>
  result.reasons.map((reason) => reason.ingredient.key);

describe('справочник из сида на настоящих этикетках', () => {
  it('не содержит дублей ключей', () => {
    const seen = new Set<string>();
    for (const item of wellnessIngredients) {
      expect(seen.has(item.key)).toBe(false);
      seen.add(item.key);
    }
  });

  it('у каждой записи есть хотя бы один алиас', () => {
    for (const item of wellnessIngredients) {
      expect(item.aliases.length).toBeGreaterThan(0);
    }
  });

  it('мармелад: находит желатин и запрещает вегетарианцу', () => {
    const result = check(
      'Состав: сироп глюкозный, сахар, желатин пищевой, кислота лимонная, ароматизатор натуральный, краситель Е120',
      VEGETARIAN,
    );
    expect(result.verdict).toBe('forbidden');
    expect(keys(result)).toContain('gelatin');
  });

  it('сухарики: лук и чеснок в приправе видны вайшнаву', () => {
    const result = check(
      'Состав: хлеб пшеничный, масло подсолнечное, соль, чеснок сушёный, лук репчатый сушёный, усилитель вкуса Е621',
      VAISHNAVA,
    );
    expect(result.verdict).toBe('forbidden');
    expect(keys(result)).toEqual(expect.arrayContaining(['garlic', 'onion']));
  });

  it('сыр с сычужным ферментом запрещён вегетарианцу', () => {
    const result = check(
      'Состав: молоко нормализованное, соль поваренная пищевая, закваска молочнокислых культур, сычужный фермент животного происхождения',
      VEGETARIAN,
    );
    expect(result.verdict).toBe('forbidden');
    expect(keys(result)).toContain('rennet');
  });

  it('печенье со следами рыбы получает предупреждение, а не запрет', () => {
    const result = check(
      'Состав: мука пшеничная, сахар, масло растительное. Может содержать рыба',
      VEGETARIAN,
    );
    expect(result.verdict).toBe('warning');
  });

  it('«натуральный ароматизатор» лишает продукт вердикта «подходит»', () => {
    const result = check(
      'Состав: вода, сахар, ароматизатор натуральный',
      VEGETARIAN,
    );
    expect(result.verdict).toBe('unknown');
    expect(result.hidden.map((r) => r.matchedText)).toContain(
      'ароматизатор натуральный',
    );
  });

  it('«может содержать следы рыбы» ловится в родительном падеже', () => {
    const result = check(
      'Состав: мука, сахар. Может содержать следы рыбы',
      VEGETARIAN,
    );
    expect(result.verdict).toBe('warning');
    expect(result.reasons.map((r) => r.ingredient.key)).toContain('fish');
  });

  it('E471 предупреждает вегетарианца: сырьё бывает животным', () => {
    const result = check(
      'Состав: мука пшеничная, сахар, эмульгатор Е471, соль',
      VEGETARIAN,
    );
    expect(keys(result)).toContain('e471');
    expect(result.verdict).toBe('warning');
  });

  it('вустерский соус ловится по названию, а не по анчоусам в скобках', () => {
    const result = check('Состав: томаты, уксус, вустерский соус', VEGETARIAN);
    expect(keys(result)).toContain('worcestershire');
  });
});
