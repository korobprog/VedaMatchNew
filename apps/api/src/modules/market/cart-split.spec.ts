import {
  groupKey,
  lineTotal,
  parseGroupKey,
  splitCart,
  type CartRow,
} from './cart-split';

const row = (over: Partial<CartRow> = {}): CartRow => ({
  listingId: 'l1',
  quantity: 1,
  shopId: 'shop-1',
  currency: 'rub',
  priceMinor: 10000,
  available: true,
  ...over,
});

describe('lineTotal', () => {
  it('multiplies price by quantity', () => {
    expect(lineTotal({ priceMinor: 10000, quantity: 3 })).toBe(30000);
  });

  // «Договорная» и «даром» не имеют цены — считаем нулём, но позицию
  // не теряем: продавец назовёт цену в переписке.
  it('counts a priceless line as zero', () => {
    expect(lineTotal({ priceMinor: null, quantity: 2 })).toBe(0);
  });
});

describe('splitCart', () => {
  it('returns nothing for an empty cart', () => {
    expect(splitCart([])).toEqual({ groups: [], unavailable: [] });
  });

  it('groups items of one shop and one currency together', () => {
    const { groups } = splitCart([
      row({ listingId: 'a', priceMinor: 10000 }),
      row({ listingId: 'b', priceMinor: 25000, quantity: 2 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.listingId)).toEqual(['a', 'b']);
    expect(groups[0].subtotalMinor).toBe(10000 + 25000 * 2);
  });

  it('splits different shops', () => {
    const { groups } = splitCart([
      row({ listingId: 'a', shopId: 'shop-1' }),
      row({ listingId: 'b', shopId: 'shop-2' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.shopId)).toEqual(['shop-1', 'shop-2']);
  });

  // Ключевое правило: рубли и рупии одного магазина — разные заявки, иначе
  // totalMinor становится бессмысленным числом.
  it('splits one shop by currency', () => {
    const { groups } = splitCart([
      row({ listingId: 'a', currency: 'rub', priceMinor: 10000 }),
      row({ listingId: 'b', currency: 'inr', priceMinor: 50000 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.currency)).toEqual(['rub', 'inr']);
    expect(groups[0].subtotalMinor).toBe(10000);
    expect(groups[1].subtotalMinor).toBe(50000);
  });

  it('keeps unavailable rows out of the groups', () => {
    const { groups, unavailable } = splitCart([
      row({ listingId: 'a' }),
      row({ listingId: 'gone', available: false, priceMinor: 99999 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.listingId)).toEqual(['a']);
    expect(groups[0].subtotalMinor).toBe(10000);
    expect(unavailable.map((r) => r.listingId)).toEqual(['gone']);
  });

  it('produces no groups when everything is unavailable', () => {
    const { groups, unavailable } = splitCart([
      row({ listingId: 'a', available: false }),
      row({ listingId: 'b', available: false }),
    ]);
    expect(groups).toEqual([]);
    expect(unavailable).toHaveLength(2);
  });

  it('keeps a priceless item in its group at zero', () => {
    const { groups } = splitCart([
      row({ listingId: 'a', priceMinor: null }),
      row({ listingId: 'b', priceMinor: 30000 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].subtotalMinor).toBe(30000);
  });

  // Порядок групп не должен прыгать между запросами.
  it('orders groups by first appearance', () => {
    const { groups } = splitCart([
      row({ listingId: 'a', shopId: 'shop-2' }),
      row({ listingId: 'b', shopId: 'shop-1' }),
      row({ listingId: 'c', shopId: 'shop-2' }),
    ]);
    expect(groups.map((g) => g.shopId)).toEqual(['shop-2', 'shop-1']);
    expect(groups[0].rows).toHaveLength(2);
  });
});

describe('group keys', () => {
  it('round-trips', () => {
    const key = groupKey({ shopId: 'shop-1', currency: 'eur' });
    expect(parseGroupKey(key)).toEqual({ shopId: 'shop-1', currency: 'eur' });
  });

  // uuid содержит дефисы, но не двоеточия — режем по последнему на всякий
  // случай, чтобы идентификатор с двоеточием не развалил ключ.
  it('splits on the last separator', () => {
    expect(parseGroupKey('a:b:rub')).toEqual({ shopId: 'a:b', currency: 'rub' });
  });

  it('rejects malformed keys', () => {
    expect(parseGroupKey('nocolon')).toBeNull();
    expect(parseGroupKey(':rub')).toBeNull();
    expect(parseGroupKey('')).toBeNull();
  });
});
