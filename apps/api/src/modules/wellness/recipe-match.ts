/**
 * Подбор рецептов под корзину.
 *
 * Задача скромнее, чем кажется: у продуктов нет разметки «это мука», есть
 * только название и состав с упаковки. Поэтому ингредиент рецепта ищется
 * словом в названии и составе продуктов корзины — сперва целиком, потом по
 * главному слову («мука пшеничная» → «мука»).
 *
 * Подбор нарочно не строгий: он предлагает, а не утверждает. Зато честно
 * показывает, чего не хватает, — по этому списку человек и решает.
 */

export interface RecipeMatch {
  /** Ингредиенты рецепта, нашедшиеся в корзине. */
  have: string[];
  /** Чего не хватает. Ради этого списка подбор и нужен. */
  missing: string[];
  /** Доля найденного, 0…1. По ней рецепты и ранжируются. */
  ratio: number;
}

const LETTER = /[\p{L}\p{N}]/u;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Целое слово: слева и справа не должно быть букв или цифр. */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    const afterAt = at + needle.length;
    const after = afterAt >= haystack.length ? '' : haystack[afterAt];
    if (!LETTER.test(before || ' ') && !LETTER.test(after || ' ')) return true;
    from = at + 1;
  }
}

/**
 * `haystacks` — названия и составы продуктов корзины: подбор смотрит и туда,
 * и туда. «Мука» встречается в составе печенья, но покупают её отдельно, и
 * человеку важнее увидеть предложение, чем строгость.
 */
export function matchRecipeToBasket(
  ingredients: string[],
  haystacks: string[],
): RecipeMatch {
  const pool = haystacks.map(normalize);
  const have: string[] = [];
  const missing: string[] = [];

  for (const ingredient of ingredients) {
    const full = normalize(ingredient);
    const head = full.split(' ')[0] ?? '';
    const found = pool.some(
      (hay) =>
        containsWord(hay, full) || (head.length > 3 && containsWord(hay, head)),
    );
    (found ? have : missing).push(ingredient);
  }

  const total = have.length + missing.length;
  return { have, missing, ratio: total === 0 ? 0 : have.length / total };
}

export interface RankedRecipe<T> {
  recipe: T;
  match: RecipeMatch;
}

/**
 * Рецепты по убыванию совпадения. Рецепты, где не нашлось ничего, из выдачи
 * убираются: «приготовьте из ничего» — не предложение.
 */
export function rankRecipes<T>(
  recipes: { recipe: T; ingredients: string[] }[],
  haystacks: string[],
): RankedRecipe<T>[] {
  return recipes
    .map(({ recipe, ingredients }) => ({
      recipe,
      match: matchRecipeToBasket(ingredients, haystacks),
    }))
    .filter((row) => row.match.have.length > 0)
    .sort((a, b) => {
      if (b.match.ratio !== a.match.ratio) return b.match.ratio - a.match.ratio;
      return a.match.missing.length - b.match.missing.length;
    });
}
