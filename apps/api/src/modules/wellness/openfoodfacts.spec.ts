import {
  WELLNESS_INGREDIENTS_RAW_MAX,
  WELLNESS_PRODUCT_NAME_MAX,
} from '@vedamatch/shared';
import {
  buildOffProductUrl,
  MissMemory,
  parseOffProduct,
  RequestGate,
} from './openfoodfacts';

describe('buildOffProductUrl', () => {
  it('собирает адрес товара и не удваивает слэш', () => {
    const url = buildOffProductUrl(
      'https://world.openfoodfacts.org/',
      '4600000000008',
    );
    expect(url).toMatch(
      /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/4600000000008\?fields=/,
    );
    expect(url).toContain('ingredients_text_ru');
  });
});

describe('parseOffProduct', () => {
  const found = (product: Record<string, unknown>) => ({ status: 1, product });

  it('берёт русский состав раньше общего', () => {
    const parsed = parseOffProduct(
      found({
        product_name: 'Hummus',
        ingredients_text_ru: 'нут, кунжутная паста, чеснок',
        ingredients_text: 'chickpeas, tahini, garlic',
      }),
    );
    expect(parsed?.ingredientsRaw).toBe('нут, кунжутная паста, чеснок');
  });

  it('без русского берёт состав на языке упаковки', () => {
    const parsed = parseOffProduct(
      found({ product_name: 'Hummus', ingredients_text: 'chickpeas, garlic' }),
    );
    expect(parsed?.ingredientsRaw).toBe('chickpeas, garlic');
  });

  it('снимает их разметку аллергенов подчёркиваниями', () => {
    const parsed = parseOffProduct(
      found({ product_name: 'Сырок', ingredients_text_ru: 'творог, _молоко_' }),
    );
    expect(parsed?.ingredientsRaw).toBe('творог, молоко');
  });

  it('без состава возвращает null — судить не о чем', () => {
    expect(parseOffProduct(found({ product_name: 'Nutella' }))).toBeNull();
    expect(
      parseOffProduct(found({ product_name: 'X', ingredients_text_ru: ' ' })),
    ).toBeNull();
  });

  it('товара нет — null', () => {
    expect(
      parseOffProduct({ status: 0, status_verbose: 'product not found' }),
    ).toBeNull();
    expect(parseOffProduct(null)).toBeNull();
    expect(parseOffProduct('oops')).toBeNull();
  });

  it('бренд — первый из списка, название — русское, если есть', () => {
    const parsed = parseOffProduct(
      found({
        product_name_ru: 'Хлебцы',
        product_name: 'Crispbread',
        brands: 'Dr. Körner, Хлебпром',
        ingredients_text_ru: 'рис, соль',
      }),
    );
    expect(parsed?.name).toBe('Хлебцы');
    expect(parsed?.brand).toBe('Dr. Körner');
  });

  it('без названия подставляет заглушку, а не роняет карточку', () => {
    expect(
      parseOffProduct(found({ ingredients_text_ru: 'рис, соль' }))?.name,
    ).toBe('Название не указано');
  });

  it('пускает только https-снимки', () => {
    const base = { product_name: 'X', ingredients_text: 'rice, salt' };
    expect(
      parseOffProduct(
        found({ ...base, image_front_url: 'https://images.off/x.jpg' }),
      )?.imageUrl,
    ).toBe('https://images.off/x.jpg');
    expect(
      parseOffProduct(
        found({ ...base, image_front_url: 'javascript:alert(1)' }),
      )?.imageUrl,
    ).toBeNull();
  });

  it('обрезает строки до наших пределов', () => {
    const parsed = parseOffProduct(
      found({
        product_name: 'н'.repeat(WELLNESS_PRODUCT_NAME_MAX + 50),
        ingredients_text: 'с'.repeat(WELLNESS_INGREDIENTS_RAW_MAX + 50),
      }),
    );
    expect(parsed?.name).toHaveLength(WELLNESS_PRODUCT_NAME_MAX);
    expect(parsed?.ingredientsRaw).toHaveLength(WELLNESS_INGREDIENTS_RAW_MAX);
  });
});

describe('RequestGate', () => {
  it('пускает лимит, дальше отказывает до конца окна', () => {
    const gate = new RequestGate(2, 60_000);
    expect(gate.tryTake(0)).toBe(true);
    expect(gate.tryTake(1_000)).toBe(true);
    expect(gate.tryTake(2_000)).toBe(false);
    expect(gate.tryTake(60_001)).toBe(true);
  });
});

describe('MissMemory', () => {
  it('помнит промах до конца срока', () => {
    const memory = new MissMemory(1_000, 10);
    memory.remember('1', 0);
    expect(memory.has('1', 999)).toBe(true);
    expect(memory.has('1', 1_000)).toBe(false);
  });

  it('при переполнении забывает самый старый', () => {
    const memory = new MissMemory(60_000, 2);
    memory.remember('1', 0);
    memory.remember('2', 1);
    memory.remember('3', 2);
    expect(memory.has('1', 3)).toBe(false);
    expect(memory.has('2', 3)).toBe(true);
    expect(memory.has('3', 3)).toBe(true);
  });
});
