import { matchRecipeToBasket, rankRecipes } from './recipe-match';

const basket = [
  'Мука пшеничная высшего сорта',
  'Состав: мука пшеничная, вода, соль',
  'Топлёное масло гхи',
  'Рис басмати',
];

describe('matchRecipeToBasket', () => {
  it('находит ингредиент целиком', () => {
    const m = matchRecipeToBasket(['рис басмати'], basket);
    expect(m.have).toEqual(['рис басмати']);
    expect(m.missing).toEqual([]);
    expect(m.ratio).toBe(1);
  });

  it('находит по главному слову, когда полное название не совпало', () => {
    const m = matchRecipeToBasket(['мука цельнозерновая'], basket);
    expect(m.have).toEqual(['мука цельнозерновая']);
  });

  it('честно перечисляет, чего не хватает', () => {
    const m = matchRecipeToBasket(['рис басмати', 'изюм', 'кардамон'], basket);
    expect(m.have).toEqual(['рис басмати']);
    expect(m.missing).toEqual(['изюм', 'кардамон']);
    expect(m.ratio).toBeCloseTo(1 / 3);
  });

  it('смотрит и в состав продукта, не только в название', () => {
    const m = matchRecipeToBasket(['вода'], basket);
    expect(m.have).toEqual(['вода']);
  });

  it('не срабатывает на слове внутри другого слова', () => {
    const m = matchRecipeToBasket(['рисовая бумага'], ['Ирис сливочный']);
    expect(m.have).toEqual([]);
  });

  it('короткое главное слово не размывает поиск', () => {
    // «сок» в «сок лимона» короче четырёх букв, и по нему искать нельзя:
    // иначе рецепт «нашёлся» бы в любом «соке» из состава.
    const m = matchRecipeToBasket(['сок лимона'], ['Сок яблочный']);
    expect(m.have).toEqual([]);
  });

  it('пустой рецепт не делит на ноль', () => {
    expect(matchRecipeToBasket([], basket).ratio).toBe(0);
  });
});

describe('rankRecipes', () => {
  const recipes = [
    { recipe: 'кичари', ingredients: ['рис басмати', 'маш', 'гхи'] },
    { recipe: 'чапати', ingredients: ['мука пшеничная', 'вода', 'соль'] },
    { recipe: 'халава', ingredients: ['манная крупа', 'сахар', 'изюм'] },
  ];

  it('впереди тот, где совпало больше', () => {
    const ranked = rankRecipes(recipes, basket);
    expect(ranked[0].recipe).toBe('чапати');
  });

  it('рецепты без единого совпадения из выдачи убираются', () => {
    const ranked = rankRecipes(recipes, basket);
    expect(ranked.map((r) => r.recipe)).not.toContain('халава');
  });

  it('на пустой корзине не предлагает ничего', () => {
    expect(rankRecipes(recipes, [])).toEqual([]);
  });
});
