import {
  ancestorsOf,
  articleExcerpt,
  buildKnowledgeSlug,
  buildKnowledgeTree,
  canNestUnder,
  depthOf,
  findKnowledgeNode,
  type KnowledgeRow,
  normalizeBody,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  parseArticleInput,
  parseCategoryInput,
  parsePage,
  withSlugSuffix,
} from './knowledge';
import { WellnessInputError } from './wellness-dto';

function row(
  id: string,
  parentId: string | null,
  position = 0,
  titleRu = id,
): KnowledgeRow {
  return {
    id,
    parentId,
    slug: id,
    titleRu,
    titleEn: null,
    descriptionRu: null,
    position,
    articleCount: 0,
  };
}

describe('buildKnowledgeSlug', () => {
  it('prefers the English title', () => {
    expect(
      buildKnowledgeSlug({ titleRu: 'Травы', titleEn: 'Herbs & Oils' }),
    ).toBe('herbs-oils');
  });

  it('transliterates the Russian title', () => {
    expect(buildKnowledgeSlug({ titleRu: 'Западная медицина' })).toBe(
      'zapadnaya-medicina',
    );
  });

  it('falls back when nothing latin remains', () => {
    expect(buildKnowledgeSlug({ titleRu: '!!!' })).toBe('category');
  });

  it('never returns a slug reserved by web routes', () => {
    expect(buildKnowledgeSlug({ titleEn: 'Article' })).toBe('article-1');
  });

  it('suffixes repeated attempts', () => {
    expect(withSlugSuffix('herbs', 0)).toBe('herbs');
    expect(withSlugSuffix('herbs', 1)).toBe('herbs-2');
  });
});

describe('buildKnowledgeTree', () => {
  it('nests children and orders by position, then title', () => {
    const tree = buildKnowledgeTree([
      row('western', null, 1),
      row('ayurveda', null, 0),
      row('herbs', 'ayurveda', 0, 'Травы'),
      row('doshas', 'ayurveda', 0, 'Доши'),
    ]);
    expect(tree.map((node) => node.id)).toEqual(['ayurveda', 'western']);
    expect(tree[0].children.map((node) => node.id)).toEqual([
      'doshas',
      'herbs',
    ]);
  });

  it('finds a nested node', () => {
    const tree = buildKnowledgeTree([row('a', null), row('b', 'a')]);
    expect(findKnowledgeNode(tree, 'b')?.parentId).toBe('a');
    expect(findKnowledgeNode(tree, 'x')).toBeNull();
  });

  it('treats an orphan as a root instead of dropping it', () => {
    const tree = buildKnowledgeTree([row('lost', 'gone')]);
    expect(tree.map((node) => node.id)).toEqual(['lost']);
  });
});

describe('ancestors and depth', () => {
  const rows = [row('a', null), row('b', 'a'), row('c', 'b')];

  it('returns the path from the root', () => {
    expect(ancestorsOf(rows, 'c').map((node) => node.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(ancestorsOf(rows, 'x')).toEqual([]);
  });

  it('stops on a cycle', () => {
    const cyclic = [row('a', 'b'), row('b', 'a')];
    expect(ancestorsOf(cyclic, 'a')).toHaveLength(2);
  });

  it('limits nesting to two levels below the root', () => {
    expect(depthOf(rows, 'a')).toBe(0);
    expect(canNestUnder(rows, 'a')).toBe(true);
    expect(canNestUnder(rows, 'b')).toBe(true);
    expect(canNestUnder(rows, 'c')).toBe(false);
  });
});

describe('parseCategoryInput', () => {
  it('requires parent and title on create', () => {
    expect(() => parseCategoryInput({ titleRu: 'Травы' }, 'create')).toThrow(
      WellnessInputError,
    );
    expect(() => parseCategoryInput({ parentId: 'a' }, 'create')).toThrow(
      WellnessInputError,
    );
    expect(
      parseCategoryInput({ parentId: 'a', titleRu: '  Травы  ' }, 'create'),
    ).toEqual({ parentId: 'a', titleRu: 'Травы' });
  });

  it('accepts partial updates and clears optional fields', () => {
    expect(
      parseCategoryInput({ titleEn: '', descriptionRu: 'О травах' }, 'update'),
    ).toEqual({ titleEn: null, descriptionRu: 'О травах' });
  });

  it('rejects a bad position', () => {
    expect(() => parseCategoryInput({ position: -1 }, 'update')).toThrow(
      WellnessInputError,
    );
  });
});

describe('parseArticleInput', () => {
  it('requires category, title and body on create, draft by default', () => {
    expect(
      parseArticleInput(
        { categoryId: 'c', title: ' Трифала ', body: 'Текст' },
        'create',
      ),
    ).toEqual({
      categoryId: 'c',
      title: 'Трифала',
      body: 'Текст',
      status: 'draft',
    });
    expect(() =>
      parseArticleInput({ categoryId: 'c', title: 'Т', body: '  ' }, 'create'),
    ).toThrow(WellnessInputError);
  });

  it('rejects an unknown status', () => {
    expect(() => parseArticleInput({ status: 'archived' }, 'update')).toThrow(
      WellnessInputError,
    );
  });

  it('leaves untouched fields out of an update', () => {
    expect(parseArticleInput({ status: 'published' }, 'update')).toEqual({
      status: 'published',
    });
  });
});

describe('normalizeBody', () => {
  it('keeps paragraphs and squeezes extra blank lines', () => {
    expect(normalizeBody('Раз  \r\n\r\n\r\n\r\nДва\n')).toBe('Раз\n\nДва');
  });
});

describe('articleExcerpt', () => {
  it('strips markdown', () => {
    expect(
      articleExcerpt('# Заголовок\n\n**Жирный** и [ссылка](http://x)'),
    ).toBe('Заголовок Жирный и ссылка');
  });

  it('cuts on a word boundary', () => {
    const excerpt = articleExcerpt('слово '.repeat(100), 30);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toContain('сло…');
    expect(excerpt.length).toBeLessThanOrEqual(31);
  });
});

describe('parsePage', () => {
  it('defaults and clamps', () => {
    expect(parsePage({})).toEqual({ page: 1, pageSize: PAGE_SIZE_DEFAULT });
    expect(parsePage({ page: '3', pageSize: '999' })).toEqual({
      page: 3,
      pageSize: PAGE_SIZE_MAX,
    });
    expect(parsePage({ page: '-1', pageSize: 'x' })).toEqual({
      page: 1,
      pageSize: PAGE_SIZE_DEFAULT,
    });
  });
});
