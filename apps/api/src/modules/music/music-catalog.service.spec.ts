import { MusicCatalogService, lineageCondition } from './music-catalog.service';

/**
 * Витрина и поиск с точки зрения линии: кто что слышит. Остальное чтение
 * каталога — раскладка запроса в Prisma без логики, его проверять нечем.
 */
function prismaMock() {
  return {
    musicTrack: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    musicCategory: { findMany: jest.fn().mockResolvedValue([]) },
    musicTrackCategory: { groupBy: jest.fn().mockResolvedValue([]) },
    musicArtist: { findMany: jest.fn().mockResolvedValue([]) },
    musicPlaylist: { findMany: jest.fn().mockResolvedValue([]) },
    musicSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
}

const config = { get: jest.fn(() => undefined) };

function service(prisma = prismaMock()) {
  return {
    prisma,
    service: new MusicCatalogService(prisma as never, config as never),
  };
}

const query = {
  q: null,
  root: null,
  category: null,
  artist: null,
  language: null,
  duration: null,
  live: null,
  lineage: null,
  sort: 'fresh' as const,
  cursor: null,
  limit: 24,
};

/**
 * Срез «не аудиокнига» (VED-237) стоит в `AND` каждой выдачи каталога:
 * записи отмеченных чтецов живут в своём разделе. Держим константой, чтобы
 * проверки линии и категорий читались про своё, а не про аудиокниги.
 */
const NOT_AUDIOBOOK = {
  OR: [{ artistId: null }, { artist: { isAudiobook: false } }],
};

/**
 * Первый аргумент первого вызова мока — без `any` в глазах ESLint: у
 * `jest.fn()` `mock.calls` типизирован как `any`, и каждое обращение к нему
 * в тесте иначе даёт ошибку правила `no-unsafe-member-access`.
 */
const firstCallArg = (fn: { mock: { calls: unknown[][] } }): unknown =>
  fn.mock.calls[0]?.[0];

const whereOf = (prisma: ReturnType<typeof prismaMock>) =>
  (
    prisma.musicTrack.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    }
  ).where;

describe('lineageCondition', () => {
  it('без линии не добавляет в where ничего', () => {
    expect(lineageCondition(null)).toEqual({});
  });

  it('с линией берёт свою и записи «для всех», не занимая верхний OR', () => {
    expect(lineageCondition('ipbys')).toEqual({
      AND: [{ OR: [{ lineage: 'ipbys' }, { lineage: null }] }],
    });
  });
});

describe('MusicCatalogService — линия слушателя', () => {
  it('гость слышит весь каталог и профиль не читается', async () => {
    const { service: catalog, prisma } = service();

    await catalog.listTracks(query, null);

    expect(whereOf(prisma).AND).toEqual([NOT_AUDIOBOOK]);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('линию из профиля Музыка не наследует — преданный слышит весь каталог', async () => {
    // VED-82: наследованный фильтр прятал записи, а строка «Показываем
    // линию…» возвращалась над каталогом при каждом заходе.
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'sri_gopinath_gaudiya_math',
    });
    const { service: catalog } = service(prisma);

    await catalog.listTracks(query, 'u1');

    expect(whereOf(prisma).AND).toEqual([NOT_AUDIOBOOK]);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('линия, выбранная в настройках Музыки, фильтрует каталог', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({
      lineage: 'sri_gopinath_gaudiya_math',
    });
    const { service: catalog } = service(prisma);

    await catalog.listTracks(query, 'u1');

    expect(whereOf(prisma).AND).toEqual([
      { OR: [{ lineage: 'sri_gopinath_gaudiya_math' }, { lineage: null }] },
      NOT_AUDIOBOOK,
    ]);
  });

  it('«all» в настройках Музыки — тоже весь каталог', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'iskcon',
    });
    prisma.musicSettings.findUnique.mockResolvedValue({ lineage: 'all' });
    const { service: catalog } = service(prisma);

    await catalog.listTracks(query, 'u1');

    expect(whereOf(prisma).AND).toEqual([NOT_AUDIOBOOK]);
  });

  it('явная линия в запросе сильнее всего и не ходит в базу за профилем', async () => {
    const prisma = prismaMock();
    const { service: catalog } = service(prisma);

    await catalog.listTracks({ ...query, lineage: 'ipbys' }, 'u1');

    expect(whereOf(prisma).AND).toEqual([
      { OR: [{ lineage: 'ipbys' }, { lineage: null }] },
      NOT_AUDIOBOOK,
    ]);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.musicSettings.findUnique).not.toHaveBeenCalled();
  });

  it('поиск по слову и линия уживаются: слово в своём OR, линия — в своём', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({ lineage: 'ipbys' });
    const { service: catalog } = service(prisma);

    await catalog.listTracks({ ...query, q: 'гаура' }, 'u1');

    // Оба условия — про OR, и второе не должно молча перетереть первое.
    const where = whereOf(prisma);
    expect(where.OR).toEqual([
      { title: { contains: 'гаура', mode: 'insensitive' } },
      { artist: { name: { contains: 'гаура', mode: 'insensitive' } } },
    ]);
    expect(where.AND).toEqual([
      { OR: [{ lineage: 'ipbys' }, { lineage: null }] },
      NOT_AUDIOBOOK,
    ]);
  });

  it('витрина фильтрует «новое» по линии из настроек Музыки', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({ lineage: 'ipbys' });
    const { service: catalog } = service(prisma);

    await catalog.showcase('u1');

    expect(whereOf(prisma)).toMatchObject({
      status: 'published',
      AND: [{ OR: [{ lineage: 'ipbys' }, { lineage: null }] }, NOT_AUDIOBOOK],
    });
  });

  it('витрина отдаёт общее число записей с тем же фильтром по линии (VED-239)', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({ lineage: 'ipbys' });
    prisma.musicTrack.count.mockResolvedValue(128);
    const { service: catalog } = service(prisma);

    const result = await catalog.showcase('u1');

    expect(result.totalTracks).toBe(128);
    expect(prisma.musicTrack.count).toHaveBeenCalledWith({
      where: {
        status: 'published',
        AND: [{ OR: [{ lineage: 'ipbys' }, { lineage: null }] }, NOT_AUDIOBOOK],
      },
    });
  });
});

// VED-165 / VED-165-2: корневая категория («Традиционное»/«Современное») —
// теперь на исполнителе (`artist.rootCategory`), стиль (киртан, мантра…) —
// по-прежнему тег записи. Фильтр обязан требовать оба одновременно
// (пересечение), а не любой из них (объединение).
describe('MusicCatalogService — корневая категория и стиль', () => {
  it('без обоих фильтров не добавляет условий по категориям — «Все» не прячет неразмеченное', async () => {
    const { service: catalog, prisma } = service();

    await catalog.listTracks(query, null);

    expect(whereOf(prisma).AND).toEqual([NOT_AUDIOBOOK]);
  });

  it('root один — условие на artist.rootCategory в AND', async () => {
    const { service: catalog, prisma } = service();

    await catalog.listTracks({ ...query, root: 'traditional' }, null);

    expect(whereOf(prisma).AND).toEqual([
      NOT_AUDIOBOOK,
      { artist: { rootCategory: { slug: 'traditional' } } },
    ]);
  });

  it('root и category вместе — оба условия в одном AND, то есть пересечение', async () => {
    const { service: catalog, prisma } = service();

    await catalog.listTracks(
      { ...query, root: 'traditional', category: 'mantra' },
      null,
    );

    expect(whereOf(prisma).AND).toEqual([
      NOT_AUDIOBOOK,
      { artist: { rootCategory: { slug: 'traditional' } } },
      { categories: { some: { category: { slug: 'mantra' } } } },
    ]);
  });

  it('root, category и линия одновременно — все три в одном AND, ни один не теряется', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({ lineage: 'ipbys' });
    const { service: catalog } = service(prisma);

    await catalog.listTracks(
      { ...query, root: 'modern', category: 'bhajan' },
      'u1',
    );

    expect(whereOf(prisma).AND).toEqual([
      { OR: [{ lineage: 'ipbys' }, { lineage: null }] },
      NOT_AUDIOBOOK,
      { artist: { rootCategory: { slug: 'modern' } } },
      { categories: { some: { category: { slug: 'bhajan' } } } },
    ]);
  });
});

// VED-165-2: счётчик корневой категории теперь суммируется по исполнителям,
// а не по прямой связи записи — молчаливо забыть об этом значило бы вернуть
// старый groupBy, который для корневой навсегда показывал бы ноль.
describe('MusicCatalogService — listCategories считает корневую через исполнителя', () => {
  it('складывает стиль (по записи) и корневую (по исполнителю) в один список', async () => {
    const prisma = prismaMock();
    prisma.musicCategory.findMany.mockResolvedValue([
      {
        id: 'traditional',
        slug: 'traditional',
        title: 'Традиционное',
        position: 0,
        kind: 'root',
      },
      {
        id: 'mantra',
        slug: 'mantra',
        title: 'Мантра',
        position: 1,
        kind: 'style',
      },
    ]);
    prisma.musicTrackCategory.groupBy.mockResolvedValue([
      { categoryId: 'mantra', _count: { trackId: 3 } },
    ]);
    prisma.musicArtist.findMany.mockResolvedValue([
      { rootCategoryId: 'traditional', _count: { tracks: 5 } },
    ]);
    const { service: catalog } = service(prisma);

    const result = await catalog.listCategories();

    expect(result).toEqual([
      expect.objectContaining({ id: 'traditional', trackCount: 5 }),
      expect.objectContaining({ id: 'mantra', trackCount: 3 }),
    ]);
  });

  it('без размеченных исполнителей корневая просто ноль, а не ошибка', async () => {
    const prisma = prismaMock();
    prisma.musicCategory.findMany.mockResolvedValue([
      {
        id: 'modern',
        slug: 'modern',
        title: 'Современное',
        position: 0,
        kind: 'root',
      },
    ]);
    const { service: catalog } = service(prisma);

    const result = await catalog.listCategories();

    expect(result).toEqual([expect.objectContaining({ trackCount: 0 })]);
  });
});

describe('MusicCatalogService — исполнители витрины', () => {
  it('отдаёт всех, а не первые восемь (VED-224)', async () => {
    const { service: catalog, prisma } = service();

    await catalog.showcase(null);

    const args = firstCallArg(prisma.musicArtist.findMany) as {
      take?: number;
    };
    expect(args.take ?? Infinity).toBeGreaterThan(8);
  });
});

// VED-237: «отображение всех аудиокниг должно находиться внутри этой
// кнопки» — значит, в каталоге их нет ни одной, а в разделе нет ничего,
// кроме них. Оба среза строятся из одной отметки у исполнителя.
describe('MusicCatalogService — раздел «Аудиокниги»', () => {
  it('витрина, поиск и счётчик обходят записи отмеченных чтецов', async () => {
    const { service: catalog, prisma } = service();

    await catalog.showcase(null);

    expect(whereOf(prisma).AND).toEqual([NOT_AUDIOBOOK]);
    expect(prisma.musicTrack.count).toHaveBeenCalledWith({
      where: { status: 'published', AND: [NOT_AUDIOBOOK] },
    });
    // Карточки чтецов на витрине тоже не нужны — у них свой раздел.
    expect(firstCallArg(prisma.musicArtist.findMany)).toMatchObject({
      where: { isAudiobook: false },
    });
  });

  it('раздел показывает только записи чтецов и по алфавиту (VED-273)', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.count.mockResolvedValue(42);
    const { service: catalog } = service(prisma);

    const result = await catalog.audiobooks(null);

    expect(result.totalTracks).toBe(42);
    const args = firstCallArg(prisma.musicTrack.findMany) as {
      where: { AND: unknown[] };
      orderBy: unknown;
    };
    expect(args.where.AND).toEqual([{ artist: { isAudiobook: true } }]);
    expect(args.orderBy).toEqual([{ title: 'asc' }, { id: 'desc' }]);
    expect(firstCallArg(prisma.musicArtist.findMany)).toMatchObject({
      where: { isAudiobook: true },
    });
  });

  it('линия слушателя действует и в разделе', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({ lineage: 'ipbys' });
    const { service: catalog } = service(prisma);

    await catalog.audiobooks('u1');

    expect(whereOf(prisma).AND).toEqual([
      { OR: [{ lineage: 'ipbys' }, { lineage: null }] },
      { artist: { isAudiobook: true } },
    ]);
  });
});
