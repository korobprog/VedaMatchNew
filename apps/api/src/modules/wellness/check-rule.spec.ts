import type {
  WellnessCheckSource,
  WellnessCheckSourceLevel,
} from '@vedamatch/shared';
import type { CheckProposal } from './check-request';
import {
  decideCheck,
  levelSources,
  pagesToFetch,
  productConfirmations,
  type CheckRuleInput,
} from './check-rule';

const COMPOSITION =
  'сахар, масло пальмовое, фундук 13%, какао обезжиренное 7.4%, молоко сухое обезжиренное, эмульгатор лецитин соевый, ванилин';

function source(
  url: string,
  level: WellnessCheckSourceLevel,
  extra: Partial<WellnessCheckSource> = {},
): WellnessCheckSource {
  return {
    url,
    title: '',
    confirmsProduct: true,
    confirmsIngredients: false,
    level,
    ingredientsOnPage: false,
    ...extra,
  };
}

const STRONG_SOURCES = [
  source('https://shop.ru/p/nutella', 'verified', {
    confirmsIngredients: true,
    ingredientsOnPage: true,
  }),
  source('https://world.openfoodfacts.org/product/3017620422003', 'opened'),
];

function proposal(extra: Partial<CheckProposal> = {}): CheckProposal {
  return {
    found: true,
    notFood: false,
    name: 'Nutella паста ореховая',
    brand: 'Ferrero',
    ingredientsRaw: COMPOSITION,
    sources: [],
    conflicts: [],
    ...extra,
  };
}

function input(extra: Partial<CheckRuleInput> = {}): CheckRuleInput {
  return {
    submitted: {
      name: 'Nutella',
      brand: 'Ferrero',
      ingredientsRaw: COMPOSITION,
    },
    proposal: proposal(),
    sources: STRONG_SOURCES,
    catalog: { submitted: ['milk:contains'], proposal: ['milk:contains'] },
    ...extra,
  };
}

describe('decideCheck — когда карточку принимает машина', () => {
  it('всё сошлось и совпало дословно — принята как есть', () => {
    const decision = decideCheck(
      input({ proposal: proposal({ name: 'Nutella' }) }),
    );
    expect(decision).toEqual({
      outcome: 'accepted',
      reasons: [],
      apply: { name: 'Nutella', brand: 'Ferrero', ingredientsRaw: COMPOSITION },
      refined: [],
    });
  });

  it('ИИ уточнил название и производителя — «уточнено и принято»', () => {
    const decision = decideCheck(
      input({
        submitted: { name: 'Nutella', brand: null, ingredientsRaw: COMPOSITION },
      }),
    );
    expect(decision.outcome).toBe('refined');
    expect(decision.refined).toEqual(['name', 'brand']);
    expect(decision.apply).toEqual({
      name: 'Nutella паста ореховая',
      brand: 'Ferrero',
      ingredientsRaw: COMPOSITION,
    });
  });

  it('опечатки распознавания исправлены по источнику — уточнён состав', () => {
    const typos = COMPOSITION.replace('пальмовое', 'пальмовоe').replace(
      'ванилин',
      'ванилнн',
    );
    const decision = decideCheck(
      input({
        submitted: { name: 'Nutella', brand: 'Ferrero', ingredientsRaw: typos },
        proposal: proposal({ name: 'Nutella' }),
      }),
    );
    expect(decision.outcome).toBe('refined');
    expect(decision.refined).toEqual(['ingredients']);
    expect(decision.apply?.ingredientsRaw).toBe(COMPOSITION);
  });

  it('нет названия или бренда в ответе — берётся присланное', () => {
    const decision = decideCheck(
      input({ proposal: proposal({ name: null, brand: null }) }),
    );
    expect(decision.outcome).toBe('accepted');
    expect(decision.apply).toEqual({
      name: 'Nutella',
      brand: 'Ferrero',
      ingredientsRaw: COMPOSITION,
    });
  });
});

describe('decideCheck — когда карточка ждёт человека', () => {
  const reviewed = (extra: Partial<CheckRuleInput>) => {
    const decision = decideCheck(input(extra));
    expect(decision.outcome).toBe('review');
    expect(decision.apply).toBeNull();
    return decision.reasons;
  };

  it('ответ ИИ не разобран', () => {
    expect(reviewed({ proposal: null })).toEqual(['ai_unreadable']);
  });

  it('ИИ не нашёл товар — даже при «хороших» источниках', () => {
    expect(reviewed({ proposal: proposal({ found: false }) })).toEqual([
      'not_found',
    ]);
  });

  it('источники противоречат — к человеку, хоть всё остальное и сошлось', () => {
    expect(
      reviewed({ proposal: proposal({ conflicts: ['у магазина другой вес'] }) }),
    ).toEqual(['sources_conflict']);
  });

  it('один сайт — мало, даже проверенный', () => {
    expect(reviewed({ sources: [STRONG_SOURCES[0]] })).toEqual([
      'too_few_sources',
    ]);
  });

  it('две страницы одного магазина — это один сайт', () => {
    expect(
      reviewed({
        sources: [
          STRONG_SOURCES[0],
          source('https://m.shop.ru/p/nutella-350', 'opened'),
        ],
      }),
    ).toEqual(['too_few_sources']);
  });

  it('источники только со слов ИИ не считаются', () => {
    expect(
      reviewed({
        sources: [STRONG_SOURCES[0], source('https://other.ru/p', 'claimed')],
      }),
    ).toEqual(['too_few_sources']);
  });

  it('главная страница сайта не подтверждает товар (как в живой пробе)', () => {
    expect(
      reviewed({
        sources: [STRONG_SOURCES[0], source('https://barcodenest.com/', 'opened')],
      }),
    ).toEqual(['too_few_sources']);
  });

  it('два сайта открыты поиском, но сервер ни одного не проверил', () => {
    expect(
      reviewed({
        sources: [
          source('https://a.ru/p', 'opened', { ingredientsOnPage: true }),
          source('https://b.ru/p', 'opened'),
        ],
      }),
    ).toEqual(['sources_unverified', 'composition_unconfirmed']);
  });

  it('по штрихкоду в источниках другой товар', () => {
    expect(
      reviewed({ proposal: proposal({ name: 'Шоколад молочный Alpen Gold' }) }),
    ).toEqual(['name_mismatch']);
  });

  it('состав не нашёлся на проверенной странице', () => {
    expect(
      reviewed({
        sources: [
          source('https://shop.ru/p', 'verified', { confirmsIngredients: true }),
          source('https://b.ru/p', 'opened'),
        ],
      }),
    ).toEqual(['composition_unconfirmed']);
  });

  it('ИИ не принёс состав — подтверждать нечего', () => {
    expect(reviewed({ proposal: proposal({ ingredientsRaw: null }) })).toEqual([
      'composition_unconfirmed',
    ]);
  });

  it('состав в источниках заметно другой', () => {
    expect(
      reviewed({
        proposal: proposal({
          ingredientsRaw: 'мука пшеничная, вода, дрожжи, соль, сахар',
        }),
      }),
    ).toEqual(['composition_mismatch']);
  });

  it('состав похож, но справочник находит в нём другое — ответ поменялся бы', () => {
    // На снимке «может содержать следы молока», на сайте этой строки нет:
    // слова почти те же, а человеку с ограничением по молоку ответ другой.
    expect(
      reviewed({
        catalog: { submitted: ['milk:mayContain'], proposal: [] },
      }),
    ).toEqual(['catalog_matches_differ']);
  });

  it('причины копятся, а не обрываются на первой', () => {
    expect(
      reviewed({
        proposal: proposal({ conflicts: ['x'], name: 'Кефир' }),
        sources: [],
      }),
    ).toEqual([
      'sources_conflict',
      'too_few_sources',
      'name_mismatch',
      'composition_unconfirmed',
    ]);
  });
});

describe('decideCheck — когда карточка отклоняется', () => {
  it('«не еда», подтверждённое двумя сайтами и сервером, — отклонена', () => {
    expect(
      decideCheck(input({ proposal: proposal({ notFood: true }) })),
    ).toEqual({
      outcome: 'rejected',
      reasons: ['not_food'],
      apply: null,
      refined: [],
    });
  });

  it('«не еда» со слов ИИ без подтверждения — к человеку, а не в отказ', () => {
    const decision = decideCheck(
      input({
        proposal: proposal({ notFood: true }),
        sources: [source('https://a.ru/p', 'opened'), source('https://b.ru/p', 'opened')],
      }),
    );
    expect(decision.outcome).toBe('review');
    expect(decision.reasons).toEqual(['not_food_unconfirmed']);
  });

  it('больше ничего машина не отклоняет: не найдено — не отказ', () => {
    expect(decideCheck(input({ proposal: proposal({ found: false }) })).outcome).toBe(
      'review',
    );
  });
});

describe('productConfirmations', () => {
  it('проверенная сервером страница подтверждает товар и без слов ИИ', () => {
    expect(
      productConfirmations([
        source('https://a.ru/p', 'verified', { confirmsProduct: false }),
        source('https://b.ru/p', 'opened'),
      ]),
    ).toEqual({ sites: 2, verified: true });
  });

  it('открытая поиском страница без слов «это тот товар» — не подтверждение', () => {
    expect(
      productConfirmations([
        source('https://a.ru/p', 'opened', { confirmsProduct: false }),
      ]),
    ).toEqual({ sites: 0, verified: false });
  });
});

describe('pagesToFetch', () => {
  const claimed = (url: string, extra: Record<string, boolean> = {}) => ({
    url,
    title: '',
    confirmsProduct: false,
    confirmsIngredients: false,
    ...extra,
  });

  it('сначала страницы с составом, потом открытые поиском, не больше четырёх', () => {
    expect(
      pagesToFetch(
        [
          claimed('https://a.ru/p'),
          claimed('https://b.ru/p', { confirmsProduct: true }),
          claimed('https://c.ru/p', { confirmsIngredients: true }),
          claimed('https://d.ru/p'),
          claimed('https://e.ru/p'),
        ],
        ['https://d.ru/p'],
      ),
    ).toEqual(['https://c.ru/p', 'https://b.ru/p', 'https://d.ru/p', 'https://a.ru/p']);
  });

  it('главные страницы и внутренние адреса сервер не открывает', () => {
    expect(
      pagesToFetch(
        [
          claimed('https://barcodenest.com/', { confirmsIngredients: true }),
          claimed('http://169.254.169.254/latest', { confirmsIngredients: true }),
          claimed('http://localhost/admin', { confirmsIngredients: true }),
          claimed('https://shop.ru/p'),
        ],
        [],
      ),
    ).toEqual(['https://shop.ru/p']);
  });
});

describe('levelSources', () => {
  const claimed = [
    {
      url: 'https://shop.ru/p',
      title: 'Nutella',
      confirmsProduct: true,
      confirmsIngredients: true,
    },
    {
      url: 'https://off.org/p',
      title: '',
      confirmsProduct: true,
      confirmsIngredients: false,
    },
    {
      url: 'https://made-up.ru/p',
      title: '',
      confirmsProduct: true,
      confirmsIngredients: false,
    },
  ];

  it('сервер видел штрихкод — verified; журнал поиска — opened; прочее — claimed', () => {
    const sources = levelSources({
      claimed,
      seenUrls: ['https://off.org/p'],
      pages: new Map([
        ['https://shop.ru/p', `Штрихкод 3017620422003. Состав: ${COMPOSITION}`],
        ['https://off.org/p', 'страница без кода'],
      ]),
      barcode: '3017620422003',
      composition: COMPOSITION,
    });
    expect(sources.map((s) => [s.level, s.ingredientsOnPage])).toEqual([
      ['verified', true],
      ['opened', false],
      ['claimed', false],
    ]);
  });

  it('состав на странице без штрихкода не засчитывается', () => {
    const [first] = levelSources({
      claimed,
      seenUrls: [],
      pages: new Map([['https://shop.ru/p', `Состав: ${COMPOSITION}`]]),
      barcode: '3017620422003',
      composition: COMPOSITION,
    });
    expect(first.level).toBe('claimed');
    expect(first.ingredientsOnPage).toBe(false);
  });

  it('на странице меньше 70% слов состава — состав не подтверждён', () => {
    const [first] = levelSources({
      claimed,
      seenUrls: [],
      pages: new Map([['https://shop.ru/p', '3017620422003 сахар фундук']]),
      barcode: '3017620422003',
      composition: COMPOSITION,
    });
    expect(first.level).toBe('verified');
    expect(first.ingredientsOnPage).toBe(false);
  });

  it('страница не открылась — уровень по журналу, состав не подтверждён', () => {
    const [first] = levelSources({
      claimed,
      seenUrls: ['https://shop.ru/p'],
      pages: new Map([['https://shop.ru/p', null]]),
      barcode: '3017620422003',
      composition: COMPOSITION,
    });
    expect(first.level).toBe('opened');
    expect(first.ingredientsOnPage).toBe(false);
  });
});
