import {
  MusicCatalogService,
  lineageCondition,
} from './music-catalog.service';

/**
 * Витрина и поиск с точки зрения линии: кто что слышит. Остальное чтение
 * каталога — раскладка запроса в Prisma без логики, его проверять нечем.
 */
function prismaMock() {
  return {
    musicTrack: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
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

const whereOf = (prisma: ReturnType<typeof prismaMock>) =>
  (prisma.musicTrack.findMany.mock.calls[0][0] as {
    where: Record<string, unknown>;
  }).where;

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

    expect(whereOf(prisma)).not.toHaveProperty('AND');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('преданный с линией в профиле слышит своё', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'sri_gopinath_gaudiya_math',
    });
    const { service: catalog } = service(prisma);

    await catalog.listTracks(query, 'u1');

    expect(whereOf(prisma).AND).toEqual([
      { OR: [{ lineage: 'sri_gopinath_gaudiya_math' }, { lineage: null }] },
    ]);
  });

  it('практикующий слышит всё, что бы ни лежало в поле линии', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'practitioner',
      lineage: 'iskcon',
    });
    const { service: catalog } = service(prisma);

    await catalog.listTracks(query, 'u1');

    expect(whereOf(prisma)).not.toHaveProperty('AND');
  });

  it('настройка Музыки сильнее профиля, «all» снимает фильтр', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'iskcon',
    });
    prisma.musicSettings.findUnique.mockResolvedValue({ lineage: 'all' });
    const { service: catalog } = service(prisma);

    await catalog.listTracks(query, 'u1');

    expect(whereOf(prisma)).not.toHaveProperty('AND');
  });

  it('явная линия в запросе сильнее всего и не ходит в базу за профилем', async () => {
    const prisma = prismaMock();
    const { service: catalog } = service(prisma);

    await catalog.listTracks({ ...query, lineage: 'ipbys' }, 'u1');

    expect(whereOf(prisma).AND).toEqual([
      { OR: [{ lineage: 'ipbys' }, { lineage: null }] },
    ]);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.musicSettings.findUnique).not.toHaveBeenCalled();
  });

  it('поиск по слову и линия уживаются: слово в своём OR, линия — в своём', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'ipbys',
    });
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
    ]);
  });

  it('витрина фильтрует «новое» по линии преданного', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'ipbys',
    });
    const { service: catalog } = service(prisma);

    await catalog.showcase('u1');

    expect(whereOf(prisma)).toMatchObject({
      status: 'published',
      AND: [{ OR: [{ lineage: 'ipbys' }, { lineage: null }] }],
    });
  });
});
