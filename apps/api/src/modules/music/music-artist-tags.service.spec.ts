import { ForbiddenException } from '@nestjs/common';
import { MusicArtistTagsService } from './music-artist-tags.service';

type Row = Record<string, unknown>;

/**
 * Разбор коллекции: у записей нет исполнителя, а в тегах файлов имя есть.
 * Хранилище и чтение тегов подменяются целиком — здесь проверяется решение,
 * а не то, как S3 отдаёт первые килобайты.
 */
function build(options: {
  /** Ключ объекта → имя в теге. `null` — тег есть, а имени в нём нет. */
  tags?: Record<string, string | null>;
  artists?: Array<{ id: string; name: string }>;
}) {
  const tags = options.tags ?? {};
  const created: Row[] = [];
  const links: Array<{ where: Row; data: Row }> = [];
  let remaining = 0;

  const prisma = {
    musicTrack: {
      findMany: jest.fn(() =>
        Promise.resolve(
          Object.keys(tags).map((storageKey, index) => ({
            id: `t${index + 1}`,
            storageKey,
            mime: 'audio/mpeg',
            sizeBytes: 5_000_000,
          })),
        ),
      ),
      updateMany: jest.fn((args: { where: Row; data: Row }) => {
        links.push(args);
        return Promise.resolve({
          count: (args.where.id as { in: string[] }).in.length,
        });
      }),
      count: jest.fn(() => Promise.resolve(remaining)),
    },
    musicArtist: {
      findMany: jest.fn(() => Promise.resolve(options.artists ?? [])),
      findFirst: jest.fn(() => Promise.resolve(null)),
      findUnique: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((args: { data: Row }) => {
        created.push(args.data);
        return Promise.resolve({ id: `a${created.length}` });
      }),
    },
  };

  const storage = {
    readPrefix: jest.fn((key: string) =>
      Promise.resolve(key in tags ? Buffer.from('tag') : null),
    ),
  };

  // Имена отдаются по порядку записей — ровно в том, в каком их вернул
  // `findMany`.
  const names = Object.values(tags);
  let call = 0;
  const metadata = {
    read: jest.fn(() => {
      const artist = names[call] ?? null;
      call += 1;
      return Promise.resolve({ common: { artist } });
    }),
  };

  const service = new MusicArtistTagsService(
    prisma as never,
    storage as never,
    metadata as never,
  );

  return {
    service,
    created,
    links,
    setRemaining: (value: number) => {
      remaining = value;
    },
  };
}

describe('MusicArtistTagsService', () => {
  it('заводит исполнителя по тегу и привязывает его записи', async () => {
    const { service, created, links } = build({
      tags: {
        'music/1.mp3': 'Aindra Prabhu',
        'music/2.mp3': 'aindra prabhu',
        'music/3.mp3': 'Bhaktivinoda',
      },
    });

    const result = await service.scan(true, { dryRun: false });

    expect(result.scanned).toBe(3);
    expect(result.withTag).toBe(3);
    expect(result.artistsCreated).toBe(2);
    expect(result.tracksLinked).toBe(3);
    expect(created.map((row) => row.name)).toEqual([
      'Aindra Prabhu',
      'Bhaktivinoda',
    ]);
    // Отметку «это тот самый человек» ставит редакция, а не тег.
    expect(created.every((row) => row.isVerified === undefined)).toBe(true);
    // Две записи одного киртаньи привязываются одним запросом.
    expect((links[0].where.id as { in: string[] }).in).toEqual(['t1', 't2']);
  });

  it('предпросмотр ничего не меняет', async () => {
    const { service, created, links } = build({
      tags: { 'music/1.mp3': 'Aindra Prabhu' },
    });

    const result = await service.scan(true, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.artistsCreated).toBe(1);
    expect(result.tracksLinked).toBe(0);
    expect(created).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it('исполнителя, который уже есть в справочнике, не заводит заново', async () => {
    const { service, created, links } = build({
      tags: { 'music/1.mp3': 'AINDRA PRABHU' },
      artists: [{ id: 'a-known', name: 'Aindra Prabhu' }],
    });

    const result = await service.scan(true, { dryRun: false });

    expect(result.artistsCreated).toBe(0);
    expect(result.artistsMatched).toBe(1);
    expect(created).toHaveLength(0);
    expect(links[0].data.artistId).toBe('a-known');
  });

  it('запись без внятного тега остаётся без исполнителя', async () => {
    const { service, created, links } = build({
      tags: { 'music/1.mp3': 'Unknown Artist', 'music/2.mp3': null },
    });

    const result = await service.scan(true, { dryRun: false });

    expect(result.scanned).toBe(2);
    expect(result.withTag).toBe(0);
    expect(created).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it('говорит, сколько записей осталось разобрать', async () => {
    const { service, setRemaining } = build({
      tags: { 'music/1.mp3': 'Aindra' },
    });
    setRemaining(37);

    await expect(service.scan(true, { dryRun: false })).resolves.toMatchObject({
      remaining: 37,
    });
  });

  it('без прав редакции коллекцию не трогает', async () => {
    const { service } = build({ tags: { 'music/1.mp3': 'Aindra' } });

    await expect(service.scan(false, { dryRun: true })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('одиночный тег при заливке: тот же справочник, то же имя', async () => {
    const { service, created } = build({ tags: {} });

    await expect(service.resolveFromTag('  Aindra   Prabhu ')).resolves.toBe(
      'a1',
    );
    expect(created[0]?.name).toBe('Aindra Prabhu');

    // Заглушка исполнителем не становится — запись останется ничьей.
    await expect(service.resolveFromTag('Unknown Artist')).resolves.toBeNull();
    expect(created).toHaveLength(1);
  });
});
