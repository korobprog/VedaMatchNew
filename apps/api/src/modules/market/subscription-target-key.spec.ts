import { savedSearchKey, subscriptionTargetKey } from './subscription-target-key';

describe('savedSearchKey', () => {
  // Главное свойство: без него @@unique([userId, kind, targetKey]) пропустит
  // дубликаты, и человек подпишется на один и тот же запрос дважды.
  it('ignores key order', () => {
    const a = savedSearchKey({ q: 'мриданга', city: 'Москва', kind: 'product' });
    const b = savedSearchKey({ kind: 'product', city: 'Москва', q: 'мриданга' });
    expect(a).toBe(b);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(savedSearchKey({ city: '  Москва ' })).toBe(
      savedSearchKey({ city: 'москва' }),
    );
  });

  // Пустая строка означает «фильтр сброшен», а не «пустой город».
  it('treats blank values as absent', () => {
    expect(savedSearchKey({ city: '', q: undefined })).toBe(savedSearchKey({}));
    expect(savedSearchKey({ q: '' })).toBe(savedSearchKey(undefined));
  });

  // `false` — это выключенный флаг, а не значение фильтра.
  it('treats a false flag as absent', () => {
    expect(savedSearchKey({ available: false })).toBe(savedSearchKey({}));
    expect(savedSearchKey({ available: true })).not.toBe(savedSearchKey({}));
  });

  // Курсор — про страницу, а не про запрос: подписка не должна от него зависеть.
  it('ignores the cursor', () => {
    expect(savedSearchKey({ q: 'книга', cursor: 'abc' })).toBe(
      savedSearchKey({ q: 'книга', cursor: 'zzz' }),
    );
    expect(savedSearchKey({ q: 'книга', cursor: 'abc' })).toBe(
      savedSearchKey({ q: 'книга' }),
    );
  });

  it('separates genuinely different queries', () => {
    expect(savedSearchKey({ q: 'мриданга' })).not.toBe(
      savedSearchKey({ q: 'караталы' }),
    );
    expect(savedSearchKey({ priceMax: 1000 })).not.toBe(
      savedSearchKey({ priceMax: 2000 })
    );
    expect(savedSearchKey({ city: 'Москва' })).not.toBe(
      savedSearchKey({ country: 'Москва' }),
    );
  });

  it('produces a short hex key that fits an index', () => {
    const key = savedSearchKey({ q: 'мриданга' });
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is stable across calls', () => {
    const query = { q: 'мриданга', priceMin: 100 };
    expect(savedSearchKey(query)).toBe(savedSearchKey(query));
  });
});

describe('subscriptionTargetKey', () => {
  it('uses the target id for shop, section and category', () => {
    expect(subscriptionTargetKey({ kind: 'shop', shopId: 's1' })).toBe('s1');
    expect(subscriptionTargetKey({ kind: 'section', sectionId: 'sec1' })).toBe(
      'sec1',
    );
    expect(subscriptionTargetKey({ kind: 'category', categoryId: 'c1' })).toBe(
      'c1',
    );
  });

  it('returns null when the target id is missing', () => {
    expect(subscriptionTargetKey({ kind: 'shop' })).toBeNull();
    expect(subscriptionTargetKey({ kind: 'category', categoryId: null })).toBeNull();
  });

  it('hashes the query for a saved search', () => {
    const key = subscriptionTargetKey({
      kind: 'saved_search',
      query: { q: 'мриданга' },
    });
    expect(key).toBe(savedSearchKey({ q: 'мриданга' }));
  });

  // Подписка на «всё подряд» допустима: это лента новинок Рынка целиком.
  it('still produces a key for an empty saved search', () => {
    expect(subscriptionTargetKey({ kind: 'saved_search' })).toBe(
      savedSearchKey(undefined),
    );
  });
});
