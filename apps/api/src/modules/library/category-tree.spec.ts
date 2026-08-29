import {
  MAX_DEPTH,
  childPath,
  depthOf,
  isDescendantOf,
  isMoveRejection,
  planMove,
  subtreeHeight,
  subtreeOf,
  type MovePlan,
  type TreeRow,
} from './category-tree';

/**
 * Дерево из миграции: два корня, у первого двое детей, у первого ребёнка —
 * внук. Идентификаторы короткие: путь читается глазами.
 *
 *   philosophy
 *     prabhupada
 *       lectures
 *     bhagavatam
 *   music
 */
function fixture(): TreeRow[] {
  return [
    { id: 'philosophy', parentId: null, path: '', position: 0 },
    { id: 'music', parentId: null, path: '', position: 1 },
    {
      id: 'prabhupada',
      parentId: 'philosophy',
      path: '.philosophy.',
      position: 0,
    },
    {
      id: 'bhagavatam',
      parentId: 'philosophy',
      path: '.philosophy.',
      position: 1,
    },
    {
      id: 'lectures',
      parentId: 'prabhupada',
      path: '.philosophy.prabhupada.',
      position: 0,
    },
  ];
}

function planOrThrow(
  rows: TreeRow[],
  nodeId: string,
  parentId: string | null,
  beforeId: string | null,
): MovePlan {
  const plan = planMove(rows, nodeId, parentId, beforeId);
  if (isMoveRejection(plan)) throw new Error(`unexpected rejection: ${plan}`);
  return plan;
}

/** Применяет план к копии строк — так проверяется итог, а не список правок. */
function apply(rows: TreeRow[], plan: MovePlan): TreeRow[] {
  const next = rows.map((row) => ({ ...row }));
  for (const update of plan.updates) {
    const target = next.find((row) => row.id === update.id);
    if (!target) throw new Error(`update for unknown row ${update.id}`);
    target.parentId = update.parentId;
    target.path = update.path;
    target.position = update.position;
  }
  return next;
}

describe('childPath', () => {
  it('у корня пустой', () => {
    expect(childPath(null)).toBe('');
  });

  it('первый уровень получает ведущую точку', () => {
    expect(childPath({ id: 'philosophy', path: '' })).toBe('.philosophy.');
  });

  it('глубже дописывается справа', () => {
    expect(childPath({ id: 'prabhupada', path: '.philosophy.' })).toBe(
      '.philosophy.prabhupada.',
    );
  });
});

describe('depthOf', () => {
  it.each([
    ['', 0],
    ['.philosophy.', 1],
    ['.philosophy.prabhupada.', 2],
  ])('%s → %i', (path, expected) => {
    expect(depthOf(path)).toBe(expected);
  });
});

describe('isDescendantOf', () => {
  it('находит потомка на любой глубине', () => {
    expect(isDescendantOf({ path: '.philosophy.prabhupada.' }, 'philosophy')).toBe(
      true,
    );
    expect(isDescendantOf({ path: '.philosophy.prabhupada.' }, 'prabhupada')).toBe(
      true,
    );
  });

  it('сам себе не потомок', () => {
    expect(isDescendantOf({ path: '.philosophy.' }, 'prabhupada')).toBe(false);
  });

  it('не путает идентификатор с его началом', () => {
    expect(isDescendantOf({ path: '.philosophy-old.' }, 'philosophy')).toBe(false);
  });
});

describe('subtreeOf и subtreeHeight', () => {
  it('поддерево начинается с самого узла', () => {
    expect(subtreeOf(fixture(), 'philosophy').map((row) => row.id)).toEqual([
      'philosophy',
      'prabhupada',
      'bhagavatam',
      'lectures',
    ]);
  });

  it('у листа высота нулевая', () => {
    expect(subtreeHeight(fixture(), 'lectures')).toBe(0);
  });

  it('высота считается по самому глубокому потомку', () => {
    expect(subtreeHeight(fixture(), 'philosophy')).toBe(2);
    expect(subtreeHeight(fixture(), 'prabhupada')).toBe(1);
  });
});

describe('planMove: отказы', () => {
  it('несуществующий узел', () => {
    expect(planMove(fixture(), 'ghost', null, null)).toBe('category_not_found');
  });

  it('несуществующий родитель', () => {
    expect(planMove(fixture(), 'music', 'ghost', null)).toBe('parent_not_found');
  });

  it('узел внутрь себя', () => {
    expect(planMove(fixture(), 'philosophy', 'philosophy', null)).toBe(
      'move_into_own_subtree',
    );
  });

  it('узел внутрь собственного потомка', () => {
    expect(planMove(fixture(), 'philosophy', 'lectures', null)).toBe(
      'move_into_own_subtree',
    );
  });

  it('поддерево не влезает по глубине', () => {
    // philosophy высотой 2 под корнем music дал бы уровень 3 у lectures.
    expect(planMove(fixture(), 'philosophy', 'music', null)).toBe(
      'max_depth_exceeded',
    );
  });

  it('цикл проверяется раньше глубины', () => {
    expect(planMove(fixture(), 'philosophy', 'bhagavatam', null)).toBe(
      'move_into_own_subtree',
    );
  });

  it('лист на предельную глубину пускается', () => {
    const plan = planOrThrow(fixture(), 'bhagavatam', 'prabhupada', null);
    const moved = apply(fixture(), plan).find((row) => row.id === 'bhagavatam')!;
    expect(depthOf(moved.path)).toBe(MAX_DEPTH);
  });
});

describe('planMove: вложение', () => {
  it('переносит узел вместе с поддеревом', () => {
    const rows = apply(fixture(), planOrThrow(fixture(), 'prabhupada', 'music', null));

    expect(rows.find((row) => row.id === 'prabhupada')).toMatchObject({
      parentId: 'music',
      path: '.music.',
    });
    expect(rows.find((row) => row.id === 'lectures')).toMatchObject({
      parentId: 'prabhupada',
      path: '.music.prabhupada.',
    });
  });

  it('смыкает прежних соседей', () => {
    const rows = apply(fixture(), planOrThrow(fixture(), 'prabhupada', 'music', null));

    expect(rows.find((row) => row.id === 'bhagavatam')).toMatchObject({
      parentId: 'philosophy',
      position: 0,
    });
  });

  it('встаёт перед указанным соседом', () => {
    const rows = apply(fixture(), planOrThrow(fixture(), 'music', 'philosophy', 'bhagavatam'));
    const siblings = rows
      .filter((row) => row.parentId === 'philosophy')
      .sort((left, right) => left.position - right.position)
      .map((row) => row.id);

    expect(siblings).toEqual(['prabhupada', 'music', 'bhagavatam']);
  });

  it('без beforeId встаёт последним', () => {
    const rows = apply(fixture(), planOrThrow(fixture(), 'music', 'philosophy', null));
    const siblings = rows
      .filter((row) => row.parentId === 'philosophy')
      .sort((left, right) => left.position - right.position)
      .map((row) => row.id);

    expect(siblings).toEqual(['prabhupada', 'bhagavatam', 'music']);
  });
});

describe('planMove: вынос в корень', () => {
  it('обнуляет путь и подтягивает поддерево', () => {
    const rows = apply(fixture(), planOrThrow(fixture(), 'prabhupada', null, 'music'));

    expect(rows.find((row) => row.id === 'prabhupada')).toMatchObject({
      parentId: null,
      path: '',
      position: 1,
    });
    expect(rows.find((row) => row.id === 'lectures')).toMatchObject({
      path: '.prabhupada.',
    });
    expect(rows.find((row) => row.id === 'music')).toMatchObject({ position: 2 });
  });
});

describe('planMove: перестановка среди своих', () => {
  it('меняет только позиции, путь не трогает', () => {
    const plan = planOrThrow(fixture(), 'bhagavatam', 'philosophy', 'prabhupada');
    const rows = apply(fixture(), plan);

    expect(plan.updates.every((update) => update.path !== undefined)).toBe(true);
    expect(rows.find((row) => row.id === 'bhagavatam')).toMatchObject({
      path: '.philosophy.',
      position: 0,
    });
    expect(rows.find((row) => row.id === 'prabhupada')).toMatchObject({
      position: 1,
    });
    expect(rows.find((row) => row.id === 'lectures')).toMatchObject({
      path: '.philosophy.prabhupada.',
    });
  });

  it('не выдаёт двух правок на один узел', () => {
    const plan = planOrThrow(fixture(), 'prabhupada', 'music', null);
    const ids = plan.updates.map((update) => update.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
