import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveVerdict } from './diet-verdict';
import {
  WELLNESS_DEFAULT_EXCLUDED,
  WELLNESS_DEFAULT_EXCLUDED_KEYS,
  WELLNESS_DEFAULT_RESTRICTIONS,
  restrictionsOrDefault,
} from './default-restrictions';
import {
  matchIngredients,
  type WellnessIngredientEntry,
} from './ingredient-match';
import { parseComposition } from './ingredient-parse';
import { dropKnownSafe } from './known-safe';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wellnessIngredients } =
  require('../../../prisma/wellness-ingredients-data.js') as {
    wellnessIngredients: WellnessIngredientEntry[];
  };

const ENTRIES: WellnessIngredientEntry[] = wellnessIngredients.map((row) => ({
  ...row,
  name: (row as unknown as { nameRu: string }).nameRu,
}));

/**
 * Тот же путь, что у сканера (`WellnessService.evaluate`): разбор строки →
 * справочник → список безвредного → вердикт. Справочник берётся настоящий,
 * из сида: тест на выдуманных записях проверял бы сам себя.
 */
function verdictFor(ingredientsRaw: string) {
  const tokens = parseComposition(ingredientsRaw);
  const { matches, unrecognized } = matchIngredients(tokens, ENTRIES);
  return resolveVerdict(
    matches,
    dropKnownSafe(tokens, unrecognized),
    WELLNESS_DEFAULT_RESTRICTIONS,
  );
}

describe('restrictionsOrDefault', () => {
  it('профиля нет — отвечает умолчание портала', () => {
    expect(restrictionsOrDefault(null)).toEqual({
      excluded: [...WELLNESS_DEFAULT_EXCLUDED],
      excludedKeys: [...WELLNESS_DEFAULT_EXCLUDED_KEYS],
    });
    expect(restrictionsOrDefault(undefined).excluded).toContain('meat');
  });

  it('профиль есть и пуст — это ответ человека, а не отсутствие ответа', () => {
    expect(restrictionsOrDefault({ excluded: [], excludedKeys: [] })).toEqual({
      excluded: [],
      excludedKeys: [],
    });
  });

  it('заполненный профиль отдаётся как есть', () => {
    expect(
      restrictionsOrDefault({ excluded: ['alcohol'], excludedKeys: ['e120'] }),
    ).toEqual({ excluded: ['alcohol'], excludedKeys: ['e120'] });
  });

  it('возвращает копию: испортить умолчание всем остальным нельзя', () => {
    const first = restrictionsOrDefault(null);
    first.excluded.push('caffeine');
    first.excludedKeys.push('tea');
    expect(restrictionsOrDefault(null).excluded).not.toContain('caffeine');
    expect(restrictionsOrDefault(null).excludedKeys).not.toContain('tea');
  });
});

describe('умолчание вайшнавского портала', () => {
  it('молочное, мёд и кофеин не закрывает — это личная практика', () => {
    for (const personal of [
      'dairy',
      'honey',
      'caffeine',
      'mushroom',
      'alcohol',
    ]) {
      expect(WELLNESS_DEFAULT_EXCLUDED).not.toContain(personal);
    }
  });

  it('класс additive целиком не закрыт — только кармин, шеллак и L-цистеин по ключу', () => {
    expect(WELLNESS_DEFAULT_EXCLUDED).not.toContain('additive');
    expect(WELLNESS_DEFAULT_EXCLUDED_KEYS).toEqual(
      expect.arrayContaining(['e120', 'e904', 'e920']),
    );
  });

  it('каждый ключ умолчания есть в справочнике — опечатка молча ничего не запретит', () => {
    const keys = new Set(wellnessIngredients.map((row) => row.key));
    for (const key of WELLNESS_DEFAULT_EXCLUDED_KEYS) {
      expect(keys.has(key)).toBe(true);
    }
  });
});

describe('вердикт под умолчанием портала', () => {
  it.each([
    ['свинина, соль, специи'],
    ['мясо куриное механической обвалки, вода'],
    ['рыба (сельдь), соль'],
    ['яичный порошок, сахар'],
    ['сахар, желатин, ароматизатор'],
    ['молоко, сычужный фермент, соль'],
    ['картофель, масло подсолнечное, лук'],
    ['мука, вода, чеснок сушёный'],
    ['сахар, кармин, вода'],
    ['сахар, глазирователь шеллак'],
  ])('«%s» — не подходит', (composition) => {
    expect(verdictFor(composition).verdict).toBe('forbidden');
  });

  it('молоко и мёд под умолчанием не запрещены', () => {
    expect(verdictFor('молоко, сахар').verdict).not.toBe('forbidden');
    expect(verdictFor('мед, вода').verdict).not.toBe('forbidden');
  });

  it('скрытая формулировка даёт «сомнительно», а не «подходит»', () => {
    // «Натуральный ароматизатор» класса `other` ничего не утверждает —
    // ни запретить, ни назвать чистым.
    expect(verdictFor('сахар, натуральный ароматизатор').verdict).toBe(
      'unknown',
    );
    // E471 может быть животным: класс `meat`, severity `hidden`.
    expect(verdictFor('мука, сахар, e471').verdict).toBe('warning');
  });

  it('незнакомое слово не превращается в «подходит»', () => {
    expect(verdictFor('вода, сахар, дигидрокверцетин').verdict).toBe('unknown');
  });

  it('чистый состав так и называется', () => {
    // Ни одного слова этого состава в справочнике нет — он весь держится на
    // списке безвредного (`known-safe.ts`). Без него ответ был бы «не знаем»,
    // и «подходит» не показалось бы ни на одном продукте в мире.
    const result = verdictFor('мука пшеничная, вода, соль, масло подсолнечное');
    expect(result.verdict).toBe('clean');
    expect(result.reasons).toEqual([]);
    expect(result.unrecognized).toEqual([]);
  });

  it('причина называет кусок этикетки, по которому сработало правило', () => {
    const result = verdictFor('вода, свинина, соль');
    expect(result.verdict).toBe('forbidden');
    expect(result.reasons[0].matchedText).toContain('свинина');
    expect(result.reasons[0].ingredient.class).toBe('meat');
  });

  it('список умолчания описан и в справочнике, и в тексте модуля', () => {
    // Сторож против «поправил константу, забыл объяснение»: если класс
    // добавили в умолчание, он обязан быть назван в комментарии файла.
    const source = readFileSync(
      join(__dirname, 'default-restrictions.ts'),
      'utf8',
    );
    for (const cls of WELLNESS_DEFAULT_EXCLUDED) {
      expect(source).toContain(`'${cls}'`);
    }
  });
});
