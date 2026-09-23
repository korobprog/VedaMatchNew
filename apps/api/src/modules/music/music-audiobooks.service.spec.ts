import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MusicAudiobooksService } from './music-audiobooks.service';

/**
 * Раздел и редактор аудиокниг (VED-297) с точки зрения правил: кто что
 * видит, что попадает в книгу и что сервис отказывается делать молча.
 */
function prismaMock() {
  return {
    musicAudiobook: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'b1', slug: 'gita' }),
      update: jest.fn().mockResolvedValue({ id: 'b1', slug: 'gita' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    musicAudiobookChapter: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicTrack: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    musicArtist: { findUnique: jest.fn().mockResolvedValue(null) },
    musicPlayState: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

const covers = {
  resolveKey: jest.fn(
    ({ next }: { next: string | null | undefined }) => next,
  ),
};
const config = { get: jest.fn(() => undefined) };

function setup(prisma = prismaMock()) {
  return {
    prisma,
    service: new MusicAudiobooksService(
      prisma as never,
      covers as never,
      config as never,
    ),
  };
}

const firstArg = (fn: { mock: { calls: unknown[][] } }): unknown =>
  fn.mock.calls[0]?.[0];

const bookRow = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  slug: 'gita',
  title: 'Бхагавад-гита',
  author: 'Вьясадева',
  description: null,
  coverKey: null,
  isPublished: true,
  reader: { id: 'a1', slug: 'reader', name: 'Чтец', coverKey: null },
  chapters: [
    { track: { durationSeconds: 600 } },
    { track: { durationSeconds: 300 } },
  ],
  ...over,
});

describe('MusicAudiobooksService — раздел', () => {
  it('показывает только опубликованные книги с опубликованными главами', async () => {
    const { service, prisma } = setup();

    await service.list();

    expect(firstArg(prisma.musicAudiobook.findMany)).toMatchObject({
      where: {
        isPublished: true,
        chapters: { some: { track: { status: 'published' } } },
      },
    });
  });

  it('карточка считает главы и общую длительность', async () => {
    const prisma = prismaMock();
    prisma.musicAudiobook.findMany.mockResolvedValue([bookRow()]);
    const { service } = setup(prisma);

    const { books } = await service.list();

    expect(books).toEqual([
      expect.objectContaining({
        title: 'Бхагавад-гита',
        reader: { id: 'a1', slug: 'reader', name: 'Чтец' },
        chapterCount: 2,
        totalSeconds: 900,
      }),
    ]);
  });

  it('черновик по прямой ссылке — 404 для участника', async () => {
    const prisma = prismaMock();
    prisma.musicAudiobook.findUnique.mockResolvedValue(
      bookRow({ isPublished: false }),
    );
    const { service } = setup(prisma);

    await expect(service.page('gita', 'u1', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('черновик открывается редакции — посмотреть до публикации', async () => {
    const prisma = prismaMock();
    prisma.musicAudiobook.findUnique.mockResolvedValue(
      bookRow({ isPublished: false }),
    );
    const { service } = setup(prisma);

    await expect(service.page('gita', 'admin', true)).resolves.toMatchObject({
      book: { slug: 'gita' },
    });
  });

  it('гостю позиции не читаются и продолжать нечего', async () => {
    const prisma = prismaMock();
    prisma.musicAudiobook.findUnique.mockResolvedValue(bookRow());
    const { service } = setup(prisma);

    const page = await service.page('gita', null, false);

    expect(page.resume).toBeNull();
    expect(prisma.musicPlayState.findMany).not.toHaveBeenCalled();
  });

  it('главы идут по порядку книги, только опубликованные', async () => {
    const prisma = prismaMock();
    prisma.musicAudiobook.findUnique.mockResolvedValue(bookRow());
    const { service } = setup(prisma);

    await service.page('gita', null, false);

    expect(firstArg(prisma.musicAudiobookChapter.findMany)).toMatchObject({
      where: { audiobookId: 'b1', track: { status: 'published' } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  });
});

describe('MusicAudiobooksService — редактор', () => {
  it('участнику редактор закрыт', async () => {
    const { service } = setup();
    await expect(service.adminList(false)).rejects.toThrow(
      'Доступ только для администратора сервиса',
    );
  });

  it('новая книга — черновик, пока её не опубликовали', async () => {
    const { service, prisma } = setup();

    await service.create(true, { title: '  Бхагавад-гита  ' });

    expect(firstArg(prisma.musicAudiobook.create)).toMatchObject({
      data: { title: 'Бхагавад-гита', isPublished: false },
    });
  });

  it('несуществующий чтец — отказ, а не книга без подписи', async () => {
    const { service } = setup();
    await expect(
      service.create(true, { title: 'Гита', readerId: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('состав пишется целиком, по порядку, с единицы', async () => {
    const prisma = prismaMock();
    prisma.musicAudiobook.findUnique.mockResolvedValue({
      id: 'b1',
      coverKey: null,
      readerId: null,
    });
    prisma.musicTrack.count.mockResolvedValue(3);
    const { service } = setup(prisma);

    await service.setChapters(true, 'b1', { trackIds: ['t3', 't1', 't2'] });

    expect(firstArg(prisma.musicAudiobookChapter.createMany)).toEqual({
      data: [
        { audiobookId: 'b1', trackId: 't3', position: 1 },
        { audiobookId: 'b1', trackId: 't1', position: 2 },
        { audiobookId: 'b1', trackId: 't2', position: 3 },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('глава чужой книги не переезжает молча', async () => {
    const prisma = prismaMock();
    prisma.musicAudiobook.findUnique.mockResolvedValue({
      id: 'b1',
      coverKey: null,
      readerId: null,
    });
    prisma.musicTrack.count.mockResolvedValue(1);
    prisma.musicAudiobookChapter.findMany.mockResolvedValue([
      {
        trackId: 't1',
        audiobookId: 'b2',
        audiobook: { title: 'Шримад-Бхагаватам' },
      },
    ]);
    const { service } = setup(prisma);

    await expect(
      service.setChapters(true, 'b1', { trackIds: ['t1'] }),
    ).rejects.toThrow('Шримад-Бхагаватам');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('несуществующая запись в составе — отказ', async () => {
    const prisma = prismaMock();
    prisma.musicAudiobook.findUnique.mockResolvedValue({
      id: 'b1',
      coverKey: null,
      readerId: null,
    });
    prisma.musicTrack.count.mockResolvedValue(1);
    const { service } = setup(prisma);

    await expect(
      service.setChapters(true, 'b1', { trackIds: ['t1', 'gone'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('подбор без слова и без чтеца ничего не ищет', async () => {
    const { service, prisma } = setup();

    await expect(service.candidates(true, '  ', null)).resolves.toEqual([]);
    expect(prisma.musicTrack.findMany).not.toHaveBeenCalled();
  });

  it('подбор предлагает только записи, которые ещё не главы', async () => {
    const { service, prisma } = setup();

    await service.candidates(true, 'гита', null);

    expect(firstArg(prisma.musicTrack.findMany)).toMatchObject({
      where: { audiobookChapter: { is: null } },
    });
  });
});
