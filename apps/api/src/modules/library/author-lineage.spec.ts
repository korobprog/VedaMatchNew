import { authorLineageFor } from '@vedamatch/shared';
import {
  authorEntriesWhere,
  authorSubtreeWhere,
  parseLineageInput,
} from './author-lineage';

describe('parseLineageInput', () => {
  it('принимает линию из справочника и null', () => {
    expect(parseLineageInput({ lineage: 'ipbys' })).toBe('ipbys');
    expect(parseLineageInput({ lineage: null })).toBeNull();
  });

  it('отвергает мусор, «все линии» и отсутствие поля', () => {
    expect(parseLineageInput({ lineage: 'hare' })).toBeUndefined();
    expect(parseLineageInput({ lineage: 'all' })).toBeUndefined();
    expect(parseLineageInput({})).toBeUndefined();
    expect(parseLineageInput(null)).toBeUndefined();
    expect(parseLineageInput('iskcon')).toBeUndefined();
  });
});

describe('authorSubtreeWhere', () => {
  it('берёт саму рубрику и потомков по пути', () => {
    expect(authorSubtreeWhere('a-1')).toEqual({
      OR: [{ id: 'a-1' }, { path: { contains: '.a-1.' } }],
    });
  });
});

describe('authorEntriesWhere', () => {
  it('не пропускает материалы «для всех линий» (NULL)', () => {
    expect(authorEntriesWhere(['a-1', 'c-2'], 'iskcon')).toEqual({
      categories: { some: { categoryId: { in: ['a-1', 'c-2'] } } },
      OR: [{ lineage: null }, { lineage: { not: 'iskcon' } }],
    });
  });
});

describe('authorLineageFor', () => {
  const nodes: Record<
    string,
    { parentId: string | null; lineage?: string | null }
  > = {
    root: { parentId: null, lineage: null },
    author: { parentId: 'root', lineage: 'sri_gopinath_gaudiya_math' },
    lectures: { parentId: 'author', lineage: null },
    other: { parentId: 'root', lineage: 'iskcon' },
    plain: { parentId: 'root' },
    broken: { parentId: 'root', lineage: 'hare' },
  };
  const lookup = (id: string) => nodes[id];

  it('линия самой рубрики', () => {
    expect(authorLineageFor(['author'], lookup)).toBe(
      'sri_gopinath_gaudiya_math',
    );
  });

  it('подрубрика наследует линию ближайшего предка', () => {
    expect(authorLineageFor(['lectures'], lookup)).toBe(
      'sri_gopinath_gaudiya_math',
    );
  });

  it('первая выбранная рубрика с линией важнее следующих', () => {
    expect(authorLineageFor(['plain', 'other', 'author'], lookup)).toBe(
      'iskcon',
    );
  });

  it('null, когда линия не задана нигде или не из справочника', () => {
    expect(authorLineageFor(['plain', 'broken'], lookup)).toBeNull();
    expect(authorLineageFor(['missing'], lookup)).toBeNull();
    expect(authorLineageFor([], lookup)).toBeNull();
  });

  it('цикл в данных не зацикливает', () => {
    const loop = (id: string) =>
      id === 'x' ? { parentId: 'y' } : { parentId: 'x' };
    expect(authorLineageFor(['x'], loop)).toBeNull();
  });
});
