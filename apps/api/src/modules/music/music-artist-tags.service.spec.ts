import { ForbiddenException } from '@nestjs/common';
import { artistNameKey } from './artist-from-tag';
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
  /** Ключ объекта → название записи. */
  titles?: Record<string, string>;
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
            title: options.titles?.[storageKey] ?? `Запись ${index + 1}`,
            createdAt: new Date('2026-09-01T00:00:00.000Z'),
            storageKey,
            mime: 'audio/mpeg',
            sizeBytes: 5_000_000,
          })),
        ),
      ),
      updateMany: jest.fn((args: { where: Row; data: Row }) => {
        links.push(args);
        const id = args.where.id;
        return Promise.resolve({
          count:
            typeof id === 'string' ? 1 : (id as { in: string[] }).in.length,
        });
      }),
      count: jest.fn(() => Promise.resolve(remaining)),
    },
    musicArtist: {
      findMany: jest.fn(() => Promise.resolve(options.artists ?? [])),
      findFirst: jest.fn((args: { where: { name: { equals: string } } }) => {
        const wanted = args.where.name.equals.toLowerCase();
        const found = (options.artists ?? []).find(
          (artist) => artist.name.toLowerCase() === wanted,
        );
        return Promise.resolve(found ? { id: found.id } : null);
      }),
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
    prisma,
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

  // Имя стоит прямо в названии, а тега нет: «…dasi - Maha Mantra» и под ним
  // «Исполнитель не указан» на витрине.
  it('без тега берёт имя из названия и оставляет в названии только песню', async () => {
    const { service, created, links } = build({
      tags: { 'music/1.mp3': null, 'music/2.mp3': null },
      titles: {
        'music/1.mp3': 'Jahnavi Dasi - Maha Mantra',
        'music/2.mp3': 'Jahnavi Dasi - Jugala Milane',
      },
    });

    const result = await service.scan(true, { dryRun: false });

    expect(result.withTag).toBe(2);
    expect(result.fromTitle).toBe(2);
    expect(created.map((row) => row.name)).toEqual(['Jahnavi Dasi']);
    expect(result.titlesRenamed).toBe(2);
    const renames = links.filter((link) => 'title' in link.data);
    expect(renames.map((link) => link.data.title)).toEqual([
      'Maha Mantra',
      'Jugala Milane',
    ]);
    // Правку редакции, сделанную во время разбора, не перетираем.
    expect(renames[0].where).toMatchObject({
      id: 't1',
      title: 'Jahnavi Dasi - Maha Mantra',
    });
  });

  it('в предпросмотре показывает, каким станет название, и ничего не меняет', async () => {
    const { service, links } = build({
      tags: { 'music/1.mp3': null },
      titles: { 'music/1.mp3': 'Jahnavi Dasi - Maha Mantra' },
    });

    const result = await service.scan(true, { dryRun: true });

    expect(result.groups[0]).toMatchObject({
      name: 'Jahnavi Dasi',
      fromTitle: 1,
      renameCount: 1,
      renames: [{ before: 'Jahnavi Dasi - Maha Mantra', after: 'Maha Mantra' }],
      skipped: false,
    });
    expect(result.titlesRenamed).toBe(1);
    expect(links).toHaveLength(0);
  });

  // «Maha Mantra - Live» тоже «что-то - что-то»: редакция снимает такое имя.
  it('имя, снятое редакцией, не заводит и записи не трогает', async () => {
    const { service, created, links } = build({
      tags: { 'music/1.mp3': null, 'music/2.mp3': 'Aindra' },
      titles: { 'music/1.mp3': 'Maha Mantra - Live' },
    });
    // Ключ тот же, что редакция получила в предпросмотре (`group.key`).
    const result = await service.scan(true, {
      dryRun: false,
      skip: [artistNameKey('Maha Mantra')],
    });

    expect(created.map((row) => row.name)).toEqual(['Aindra']);
    expect(links.every((link) => link.data.artistId === 'a1')).toBe(true);
    expect(
      result.groups.find((group) => group.name === 'Maha Mantra'),
    ).toMatchObject({ skipped: true });
    expect(result.artistsCreated).toBe(1);
  });

  it('убирает из названия повтор имени, взятого из тега', async () => {
    const { service, links } = build({
      tags: { 'music/1.mp3': 'Aindra' },
      titles: { 'music/1.mp3': 'Aindra - Hare Krishna' },
    });

    const result = await service.scan(true, { dryRun: false });

    expect(result.fromTitle).toBe(0);
    expect(links.find((link) => 'title' in link.data)?.data.title).toBe(
      'Hare Krishna',
    );
  });

  it('продолжает с того места, где остановился прошлый прогон', async () => {
    const { service, prisma } = build({ tags: { 'music/1.mp3': 'Aindra' } });

    const result = await service.scan(true, {
      dryRun: true,
      after: '2026-09-01T00:00:00.000Z|0b7d6e2c-1111-4222-8333-944455556666',
    });

    const where = (
      prisma.musicTrack.findMany.mock.calls as unknown as Array<
        [{ where: Record<string, unknown> }]
      >
    )[0][0].where;
    expect(where).toMatchObject({ artistId: null });
    expect(where.OR).toHaveLength(2);
    // Пачка неполная — коллекция кончилась, продолжать нечего.
    expect(result.nextCursor).toBeNull();
  });

  describe('заливка', () => {
    it('тег заводит исполнителя и убирает его имя из названия', async () => {
      const { service, created } = build({ tags: {} });

      await expect(
        service.resolveForIngest('Aindra', 'Aindra - Hare Krishna'),
      ).resolves.toEqual({ artistId: 'a1', title: 'Hare Krishna' });
      expect(created[0]?.name).toBe('Aindra');
    });

    it('имя из названия привязывает к уже заведённому исполнителю', async () => {
      const { service, created } = build({
        tags: {},
        artists: [{ id: 'a-known', name: 'Jahnavi Dasi' }],
      });

      await expect(
        service.resolveForIngest(null, 'jahnavi dasi - Maha Mantra'),
      ).resolves.toEqual({ artistId: 'a-known', title: 'Maha Mantra' });
      expect(created).toHaveLength(0);
    });

    // Новое имя из названия заводит только редакция, через разбор в админке.
    it('незнакомое имя из названия не заводит и название не трогает', async () => {
      const { service, created } = build({ tags: {} });

      await expect(
        service.resolveForIngest(null, 'Maha Mantra - Live'),
      ).resolves.toEqual({ artistId: null, title: 'Maha Mantra - Live' });
      expect(created).toHaveLength(0);
    });
  });
});
