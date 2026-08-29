import {
  MAX_OFFLINE_IDS,
  normalizeOfflineIds,
  offlineAllowedWhere,
} from './music-offline-query';

describe('normalizeOfflineIds', () => {
  it('схлопывает повторы', () => {
    expect(normalizeOfflineIds(['t1', 't1', 't2'])).toEqual(['t1', 't2']);
  });

  // В теле запроса может прийти что угодно, и падать на этом нельзя.
  it('выбрасывает мусор вместо падения', () => {
    expect(normalizeOfflineIds([null, 42, '', '  ', 't1'])).toEqual(['t1']);
    expect(normalizeOfflineIds('не массив')).toEqual([]);
    expect(normalizeOfflineIds(undefined)).toEqual([]);
  });

  it('держит потолок', () => {
    const many = Array.from(
      { length: MAX_OFFLINE_IDS + 50 },
      (_, i) => `t${i}`,
    );
    expect(normalizeOfflineIds(many)).toHaveLength(MAX_OFFLINE_IDS);
  });
});

describe('offlineAllowedWhere', () => {
  // Без условия видимости по сверке перебирались бы чужие черновики:
  // положил идентификатор в список — узнал, что запись существует.
  it('обычному человеку — опубликованное и своё', () => {
    const where = offlineAllowedWhere(['t1'], {
      userId: 'u1',
      isAdmin: false,
    });

    expect(where.id.in).toEqual(['t1']);
    expect(where.OR).toEqual([{ status: 'published' }, { uploadedById: 'u1' }]);
  });

  it('редакции — всё, что спросили', () => {
    const where = offlineAllowedWhere(['t1'], {
      userId: 'admin',
      isAdmin: true,
    });

    expect(where.id.in).toEqual(['t1']);
    expect(where.OR).toBeUndefined();
  });
});
