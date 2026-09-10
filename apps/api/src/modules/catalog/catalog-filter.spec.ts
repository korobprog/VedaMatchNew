import { buildCatalogFilter } from './catalog-filter';

describe('buildCatalogFilter', () => {
  const base = { userId: 'u1', stageFilters: [] };

  it('выключенный сервис скрыт от обычного человека', () => {
    const where = buildCatalogFilter({ ...base, isAdmin: false });
    expect(where.status).toEqual({ not: 'disabled' });
  });

  it('выключенный сервис скрыт и от администратора: это сетка, а не админка', () => {
    const where = buildCatalogFilter({ ...base, isAdmin: true });
    expect(where.status).toEqual({ not: 'disabled' });
  });

  it('администратору не режут видимость по публичности и этапу', () => {
    expect(buildCatalogFilter({ ...base, isAdmin: true }).OR).toBeUndefined();
  });

  it('обычному человеку остаются публичные, выданные лично и по этапу', () => {
    const where = buildCatalogFilter({
      ...base,
      isAdmin: false,
      stageFilters: [{ seekerVisible: true }],
    });
    expect(where.OR).toEqual([
      { public: true },
      { access: { some: { userId: 'u1' } } },
      { seekerVisible: true },
    ]);
  });
});
