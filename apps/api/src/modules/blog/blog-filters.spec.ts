import {
  blogCategoryInput,
  blogCategoryWhere,
  blogFilterConditions,
  blogLineageInput,
  blogLineageWhere,
  combineBlogWhere,
} from './blog-filters';

describe('blogLineageInput (VED-596)', () => {
  it('accepts a lineage from the directory', () => {
    expect(blogLineageInput('iskcon')).toBe('iskcon');
    expect(blogLineageInput('ipbys')).toBe('ipbys');
  });

  it('reads empty values as «for everyone»', () => {
    expect(blogLineageInput(null)).toBeNull();
    expect(blogLineageInput(undefined)).toBeNull();
    expect(blogLineageInput('')).toBeNull();
  });

  it('refuses a group and garbage', () => {
    expect(blogLineageInput('group:gaudiya_math')).toBe('invalid');
    expect(blogLineageInput('all')).toBe('invalid');
    expect(blogLineageInput('nope')).toBe('invalid');
    expect(blogLineageInput(42)).toBe('invalid');
  });
});

describe('blogLineageWhere (VED-596)', () => {
  it('keeps the chosen lineage and posts for everyone', () => {
    expect(blogLineageWhere('iskcon')).toEqual({
      OR: [{ lineage: 'iskcon' }, { lineage: null }],
    });
  });

  it('expands a group into its lineages', () => {
    const where = blogLineageWhere('group:gaudiya_math');
    expect(where).toEqual({
      OR: [
        {
          lineage: {
            in: [
              'sri_chaitanya_gaudiya_math',
              'sri_chaitanya_saraswat_math',
              'sri_gopinath_gaudiya_math',
              'ipbys',
            ],
          },
        },
        { lineage: null },
      ],
    });
  });

  it('does not filter without a value, for «all» and for garbage', () => {
    expect(blogLineageWhere(undefined)).toBeNull();
    expect(blogLineageWhere('')).toBeNull();
    expect(blogLineageWhere('all')).toBeNull();
    expect(blogLineageWhere('group:nope')).toBeNull();
  });
});

describe('blogCategoryInput (VED-590)', () => {
  it('accepts every category of the list', () => {
    for (const value of ['knowledge', 'news', 'devotee_life', 'calendar']) {
      expect(blogCategoryInput(value)).toBe(value);
    }
  });

  it('tells «not sent» from «cleared»', () => {
    expect(blogCategoryInput(undefined)).toBeUndefined();
    expect(blogCategoryInput(null)).toBeNull();
    // Multipart не умеет null: «Без категории» уезжает пустой строкой.
    expect(blogCategoryInput('')).toBeNull();
  });

  it('refuses anything else', () => {
    expect(blogCategoryInput('all')).toBe('invalid');
    expect(blogCategoryInput('Новости')).toBe('invalid');
    expect(blogCategoryInput(1)).toBe('invalid');
  });
});

describe('blogCategoryWhere (VED-590)', () => {
  it('shows only the chosen category', () => {
    expect(blogCategoryWhere('news')).toEqual({ category: 'news' });
  });

  it('does not filter for «all», empty and garbage', () => {
    expect(blogCategoryWhere(undefined)).toBeNull();
    expect(blogCategoryWhere('')).toBeNull();
    expect(blogCategoryWhere('all')).toBeNull();
    expect(blogCategoryWhere('nope')).toBeNull();
  });
});

describe('blogFilterConditions', () => {
  it('is empty without filters', () => {
    expect(blogFilterConditions({})).toEqual([]);
  });

  it('adds both filters together', () => {
    expect(
      blogFilterConditions({ category: 'calendar', lineage: 'iskcon' }),
    ).toEqual([
      { category: 'calendar' },
      { OR: [{ lineage: 'iskcon' }, { lineage: null }] },
    ]);
  });

  it('adds the lineage condition', () => {
    expect(blogFilterConditions({ lineage: 'iskcon' })).toEqual([
      { OR: [{ lineage: 'iskcon' }, { lineage: null }] },
    ]);
  });
});

describe('combineBlogWhere', () => {
  it('leaves the base alone when there is nothing to add', () => {
    const base = { OR: [{ feedUntil: null }] };
    expect(combineBlogWhere(base, [])).toBe(base);
  });

  it('joins with AND so the OR of the base survives', () => {
    const base = { OR: [{ feedUntil: null }] };
    const lineage = { OR: [{ lineage: 'iskcon' }, { lineage: null }] };
    expect(combineBlogWhere(base, [lineage])).toEqual({
      AND: [base, lineage],
    });
  });
});
