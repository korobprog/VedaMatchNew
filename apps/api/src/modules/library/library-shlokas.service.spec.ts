/* eslint-disable @typescript-eslint/no-unsafe-assignment -- expect.objectContaining отдаёт any */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LibraryShlokasService } from './library-shlokas.service';

const NOW = new Date('2026-09-24T10:00:00.000Z');
const CATEGORY = {
  id: 'cat-bg',
  slug: 'bhagavad-gita',
  titleRu: 'Бхагавад-гита',
  titleEn: null,
  path: '.cat-root.',
  status: 'active',
};

function detailRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sh-2',
    type: 'shloka',
    status: 'published',
    titleRu: 'Бхагавад-гита 2.13',
    source: 'Бхагавад-гита',
    contentLanguage: 'ru',
    bookmarkCount: 0,
    commentsCount: 0,
    publishedAt: NOW,
    addedById: 'author',
    addedBy: { id: 'author', name: 'Иван', spiritualName: 'Говинда дас' },
    categories: [{ category: CATEGORY }],
    shloka: {
      verse: '2.13',
      text: 'dehino ’smin',
      wordByWord: null,
      translation: 'Как воплощённая душа',
      commentary: null,
      images: [
        { id: 'img-1', url: 'u1', width: 10, height: 10, acharyaId: null },
        { id: 'img-2', url: 'u2', width: 10, height: 10, acharyaId: 'ac-1' },
      ],
      acharyas: [
        {
          id: 'ac-1',
          acharya: 'Шридхара Свами',
          text: null,
          wordByWord: null,
          translation: null,
          commentary: 'толкование',
        },
      ],
    },
    ...over,
  };
}

function editableRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sh-2',
    type: 'shloka',
    status: 'published',
    source: 'Бхагавад-гита',
    addedById: 'author',
    shloka: {
      verse: '2.13',
      text: 'dehino ’smin',
      wordByWord: null,
      translation: null,
      commentary: null,
      acharyas: [{ id: 'ac-1' }, { id: 'ac-2' }],
    },
    ...over,
  };
}

function setup({
  configured = true,
  imagesCount = 0,
}: { configured?: boolean; imagesCount?: number } = {}) {
  const tx = {
    libraryEntry: {
      create: jest.fn().mockResolvedValue({ id: 'sh-new' }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    libraryShloka: {
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    },
    libraryShlokaAcharya: {
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
    libraryEntryCategory: { create: jest.fn().mockResolvedValue(undefined) },
    libraryCategory: { update: jest.fn().mockResolvedValue(undefined) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    libraryCategory: {
      findFirst: jest.fn().mockResolvedValue(CATEGORY),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'cat-root', slug: 'shloki', titleRu: 'ШЛОКИ', titleEn: null },
        ]),
    },
    libraryEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([
        { id: 'sh-3', publishedAt: NOW, shloka: { verse: '2.14' } },
        { id: 'sh-2', publishedAt: NOW, shloka: { verse: '2.13' } },
        { id: 'sh-10', publishedAt: NOW, shloka: { verse: '10.1' } },
        { id: 'sh-1', publishedAt: NOW, shloka: { verse: '2.2' } },
      ]),
    },
    libraryShloka: { findMany: jest.fn().mockResolvedValue([]) },
    libraryShlokaImage: {
      findMany: jest.fn().mockResolvedValue([{ storageKey: 'k-ac-2' }]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(imagesCount),
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 1 } }),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'img-new', ...args.data }),
      ),
      delete: jest.fn().mockResolvedValue(undefined),
    },
  };
  const previews = {
    configured,
    storeImage: jest.fn().mockResolvedValue({
      key: 'library/shlokas/sh-2/x.webp',
      url: 'https://cdn/x.webp',
      width: 1600,
      height: 900,
    }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const bookmarks = { markedAmong: jest.fn().mockResolvedValue(new Set()) };
  const events = { emit: jest.fn() };
  const service = new LibraryShlokasService(
    prisma as never,
    previews as never,
    bookmarks as never,
    events as never,
  );
  return { service, prisma, tx, previews, events };
}

describe('LibraryShlokasService.byId', () => {
  it('даёт соседей по порядку стихов источника и делит картинки по блокам', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntry.findUnique.mockResolvedValue(detailRow());

    const dto = await service.byId('sh-2', 'reader', false);

    // Порядок: 2.2 → 2.13 → 2.14 → 10.1
    expect(dto.prev).toEqual({ id: 'sh-1', verse: '2.2' });
    expect(dto.next).toEqual({ id: 'sh-3', verse: '2.14' });
    expect(dto.position).toBe(2);
    expect(dto.total).toBe(4);
    expect(dto.category?.slug).toBe('bhagavad-gita');
    expect(dto.images.map((image) => image.id)).toEqual(['img-1']);
    expect(dto.acharyas[0].images.map((image) => image.id)).toEqual(['img-2']);
    expect(dto.addedBy?.name).toBe('Говинда дас');
    expect(dto.canEdit).toBe(false);
  });

  it('автор и админ могут править', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntry.findUnique.mockResolvedValue(detailRow());
    expect((await service.byId('sh-2', 'author', false)).canEdit).toBe(true);
    expect((await service.byId('sh-2', 'other', true)).canEdit).toBe(true);
  });

  it('не шлока и скрытый материал — 404', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntry.findUnique.mockResolvedValue(
      detailRow({ type: 'article' }),
    );
    await expect(service.byId('sh-2', 'r', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.libraryEntry.findUnique.mockResolvedValue(
      detailRow({ status: 'hidden_by_reports' }),
    );
    await expect(service.byId('sh-2', 'r', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('LibraryShlokasService.list', () => {
  it('отдаёт страницу по порядку стихов и строку источника раздела', async () => {
    const { service, prisma } = setup();
    prisma.libraryShloka.findMany.mockResolvedValue(
      ['sh-1', 'sh-2', 'sh-3', 'sh-10'].map((entryId) => ({
        entryId,
        verse: entryId,
        text: 'стих',
        translation: null,
        _count: { images: 0, acharyas: 0 },
      })),
    );

    const page = await service.list('bhagavad-gita', undefined, undefined);

    expect(page.items.map((item) => item.id)).toEqual([
      'sh-1',
      'sh-2',
      'sh-3',
      'sh-10',
    ]);
    expect(page.total).toBe(4);
    expect(page.nextOffset).toBeNull();
    expect(page.sourceLabel).toBe('Бхагавад-гита');
  });

  it('неизвестная рубрика — 404', async () => {
    const { service, prisma } = setup();
    prisma.libraryCategory.findFirst.mockResolvedValue(null);
    await expect(
      service.list('nope', undefined, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LibraryShlokasService.create', () => {
  it('проставляет источник по рубрике, линию «для всех» и заголовок из номера', async () => {
    const { service, prisma, tx, events } = setup();
    prisma.libraryEntry.findUnique.mockResolvedValue(
      detailRow({ id: 'sh-new' }),
    );

    await service.create('author', false, {
      categoryId: 'cat-bg',
      verse: ' 2.13 ',
      text: 'dehino ’smin',
      translation: 'Как воплощённая душа',
      acharyas: [{ acharya: 'Шридхара Свами', commentary: 'толкование' }],
    });

    expect(tx.libraryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'shloka',
          source: 'Бхагавад-гита',
          titleRu: 'Бхагавад-гита 2.13',
          descriptionRu: 'Как воплощённая душа',
          lineage: null,
          enrichmentStatus: 'not_applicable',
          addedById: 'author',
        }),
      }),
    );
    const [[{ data: shloka }]] = tx.libraryShloka.create.mock.calls as [
      [{ data: { verse: string; acharyas: { create: unknown[] } } }],
    ];
    expect(shloka.verse).toBe('2.13');
    expect(shloka.acharyas.create).toEqual([
      expect.objectContaining({ acharya: 'Шридхара Свами', position: 0 }),
    ]);
    expect(tx.libraryEntryCategory.create).toHaveBeenCalledWith({
      data: { entryId: 'sh-new', categoryId: 'cat-bg', addedById: 'author' },
    });
    expect(tx.libraryCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-bg' },
      data: { entriesCount: { increment: 1 } },
    });
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('без оригинала: пустой текст, заголовок по началу перевода (VED-464)', async () => {
    const { service, prisma, tx } = setup();
    prisma.libraryEntry.findUnique.mockResolvedValue(
      detailRow({ id: 'sh-new' }),
    );

    await service.create('author', false, {
      categoryId: 'cat-bg',
      source: 'Бхагавад-гита',
      translation: 'Как воплощённая душа\nпереходит',
    });

    expect(tx.libraryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titleRu: 'Бхагавад-гита: Как воплощённая душа',
        }),
      }),
    );
  });

  it('без перевода и без рубрики — 400', async () => {
    const { service, prisma } = setup();
    await expect(
      service.create('author', false, { categoryId: 'cat-bg', text: 'стих' }),
    ).rejects.toThrow(new BadRequestException('translation_required'));
    prisma.libraryCategory.findFirst.mockResolvedValue(null);
    await expect(
      service.create('author', false, {
        categoryId: 'x',
        text: 'стих',
        translation: 'перевод',
      }),
    ).rejects.toThrow(new BadRequestException('category_not_found'));
  });
});

describe('LibraryShlokasService.update', () => {
  it('чужую шлоку править нельзя', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntry.findUnique.mockResolvedValue(editableRow());
    await expect(
      service.update('stranger', false, 'sh-2', { text: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('блоки ачарьев: известный id правится, новый создаётся, пропавший удаляется с картинками', async () => {
    const { service, prisma, tx, previews } = setup();
    prisma.libraryEntry.findUnique
      .mockResolvedValueOnce(editableRow())
      .mockResolvedValue(detailRow());

    await service.update('author', false, 'sh-2', {
      verse: '2.14',
      acharyas: [
        { id: 'ac-1', acharya: 'Шридхара Свами', commentary: 'новое' },
        { acharya: 'Вишванатха Чакраварти', translation: 'перевод' },
      ],
    });

    expect(tx.libraryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ titleRu: 'Бхагавад-гита 2.14' }),
      }),
    );
    expect(tx.libraryShlokaAcharya.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['ac-2'] }, shlokaId: 'sh-2' },
    });
    expect(tx.libraryShlokaAcharya.update).toHaveBeenCalledWith({
      where: { id: 'ac-1' },
      data: expect.objectContaining({ commentary: 'новое', position: 0 }),
    });
    expect(tx.libraryShlokaAcharya.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acharya: 'Вишванатха Чакраварти',
        position: 1,
        shlokaId: 'sh-2',
      }),
    });
    expect(previews.remove).toHaveBeenCalledWith('k-ac-2');
  });

  it('без списка ачарьев блоки не трогаются', async () => {
    const { service, prisma, tx } = setup();
    prisma.libraryEntry.findUnique
      .mockResolvedValueOnce(editableRow())
      .mockResolvedValue(detailRow());
    await service.update('author', true, 'sh-2', { translation: 'новый' });
    expect(tx.libraryShlokaAcharya.deleteMany).not.toHaveBeenCalled();
    expect(tx.libraryShlokaAcharya.create).not.toHaveBeenCalled();
  });
});

describe('LibraryShlokasService.addImage', () => {
  const file = { buffer: Buffer.from('x'), mimetype: 'image/png', size: 10 };

  it('кладёт картинку следующей по порядку', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntry.findUnique.mockResolvedValue(editableRow());
    const image = await service.addImage('author', false, 'sh-2', file, 'ac-1');
    expect(image).toEqual(
      expect.objectContaining({ acharyaId: 'ac-1', position: 2, width: 1600 }),
    );
  });

  it('отказывает сверх предела, чужому блоку и без хранилища', async () => {
    const full = setup({ imagesCount: 12 });
    full.prisma.libraryEntry.findUnique.mockResolvedValue(editableRow());
    await expect(
      full.service.addImage('author', false, 'sh-2', file, undefined),
    ).rejects.toThrow(new BadRequestException('too_many_images'));

    const foreign = setup();
    foreign.prisma.libraryEntry.findUnique.mockResolvedValue(editableRow());
    await expect(
      foreign.service.addImage('author', false, 'sh-2', file, 'ac-other'),
    ).rejects.toThrow(new BadRequestException('acharya_not_found'));

    const offline = setup({ configured: false });
    offline.prisma.libraryEntry.findUnique.mockResolvedValue(editableRow());
    await expect(
      offline.service.addImage('author', false, 'sh-2', file, undefined),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('не картинка — 400', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntry.findUnique.mockResolvedValue(editableRow());
    await expect(
      service.addImage(
        'author',
        false,
        'sh-2',
        { ...file, mimetype: 'application/pdf' },
        undefined,
      ),
    ).rejects.toThrow(new BadRequestException('unsupported_image_type'));
  });
});
