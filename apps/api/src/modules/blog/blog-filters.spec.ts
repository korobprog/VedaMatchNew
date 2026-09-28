import {
  blogAudienceStagesChoice,
  blogAudienceStagesWhere,
  blogCategoryChoice,
  blogCategoryWhere,
  blogFilterConditions,
  blogLineageChoice,
  blogLineageInput,
  blogLineageWhere,
  blogPostMarksInput,
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
    // «Для всех» из меню и формы — то же значение, что в фильтре.
    expect(blogLineageInput('all')).toBeNull();
  });

  it('refuses a group and garbage', () => {
    expect(blogLineageInput('group:gaudiya_math')).toBe('invalid');
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

describe('blogCategoryChoice (VED-590)', () => {
  it('accepts every category of the list', () => {
    for (const value of ['knowledge', 'news', 'devotee_life', 'calendar']) {
      expect(blogCategoryChoice(value)).toBe(value);
    }
  });

  it('tells «not sent» from «cleared»', () => {
    expect(blogCategoryChoice(undefined)).toBeUndefined();
    expect(blogCategoryChoice(null)).toBe('required');
    // Multipart не умеет null: очищенное поле уезжает пустой строкой.
    expect(blogCategoryChoice('')).toBe('required');
  });

  it('refuses anything else', () => {
    expect(blogCategoryChoice('all')).toBe('invalid');
    expect(blogCategoryChoice('Новости')).toBe('invalid');
    expect(blogCategoryChoice(1)).toBe('invalid');
  });
});

describe('blogLineageChoice (VED-590)', () => {
  it('reads «all» as an explicit «for everyone»', () => {
    expect(blogLineageChoice('all')).toBeNull();
  });

  it('does not take emptiness for «for everyone»', () => {
    expect(blogLineageChoice(null)).toBe('required');
    expect(blogLineageChoice('')).toBe('required');
    expect(blogLineageChoice(undefined)).toBeUndefined();
  });

  it('accepts a lineage and refuses a group and garbage', () => {
    expect(blogLineageChoice('iskcon')).toBe('iskcon');
    expect(blogLineageChoice('group:gaudiya_math')).toBe('invalid');
    expect(blogLineageChoice('nope')).toBe('invalid');
  });
});

describe('blogPostMarksInput (VED-590)', () => {
  it('without the fields — as before: old app builds keep publishing', () => {
    expect(blogPostMarksInput({})).toEqual({});
    expect(blogPostMarksInput(undefined)).toEqual({});
  });

  it('a sent but empty field is refused', () => {
    expect(blogPostMarksInput({ category: '', lineage: 'all' })).toEqual({
      error: 'category_required',
    });
    expect(blogPostMarksInput({ category: 'news', lineage: '' })).toEqual({
      error: 'lineage_required',
    });
    expect(blogPostMarksInput({ category: 'news', lineage: null })).toEqual({
      error: 'lineage_required',
    });
  });

  it('a lineage or explicitly for everyone', () => {
    expect(blogPostMarksInput({ category: 'news', lineage: 'iskcon' })).toEqual(
      { category: 'news', lineage: 'iskcon' },
    );
    expect(
      blogPostMarksInput({ category: 'calendar', lineage: 'all' }),
    ).toEqual({ category: 'calendar', lineage: null });
    expect(blogPostMarksInput({ lineage: 'all' })).toEqual({ lineage: null });
  });

  it('refuses garbage with its own code', () => {
    expect(blogPostMarksInput({ category: 'sport', lineage: 'all' })).toEqual({
      error: 'invalid_category',
    });
    expect(blogPostMarksInput({ category: 'news', lineage: 'nope' })).toEqual({
      error: 'invalid_lineage',
    });
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

describe('blogAudienceStagesChoice (VED-590)', () => {
  it('tells «not sent» from «cleared»', () => {
    expect(blogAudienceStagesChoice(undefined)).toBeUndefined();
    expect(blogAudienceStagesChoice(null)).toBe('required');
    expect(blogAudienceStagesChoice('')).toBe('required');
    expect(blogAudienceStagesChoice([])).toBe('required');
  });

  it('reads «all» and all four stages as «for everyone»', () => {
    expect(blogAudienceStagesChoice('all')).toEqual([]);
    expect(blogAudienceStagesChoice(['all'])).toEqual([]);
    expect(
      blogAudienceStagesChoice(['devotee', 'yogi', 'practitioner', 'seeker']),
    ).toEqual([]);
  });

  it('keeps the stages in the order of the path; one multipart value is a string', () => {
    expect(blogAudienceStagesChoice(['devotee', 'seeker', 'devotee'])).toEqual([
      'seeker',
      'devotee',
    ]);
    expect(blogAudienceStagesChoice('yogi')).toEqual(['yogi']);
  });

  it('refuses garbage and «all» mixed with stages', () => {
    expect(blogAudienceStagesChoice('guru')).toBe('invalid');
    expect(blogAudienceStagesChoice(['all', 'yogi'])).toBe('invalid');
    expect(blogAudienceStagesChoice({ stage: 'yogi' })).toBe('invalid');
  });
});

describe('blogAudienceStagesWhere (VED-590)', () => {
  it('does not filter without stages', () => {
    expect(blogAudienceStagesWhere(null, 'me')).toBeNull();
    expect(blogAudienceStagesWhere([], 'me')).toBeNull();
  });

  it('keeps posts of the stages, for everyone and the viewer’s own', () => {
    expect(blogAudienceStagesWhere(['seeker', 'yogi'], 'me')).toEqual({
      OR: [
        { audienceStages: { isEmpty: true } },
        { audienceStages: { hasSome: ['seeker', 'yogi'] } },
        { authorId: 'me' },
      ],
    });
  });
});
