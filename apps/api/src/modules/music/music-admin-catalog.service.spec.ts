import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicAdminCatalogService } from './music-admin-catalog.service';
import { MusicCoversService } from './music-covers.service';
import { MusicStorageService } from './music-storage.service';

function prismaMock() {
  const tx = {
    musicCategory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    musicTrackCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicTrack: {
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 't1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 't1' }),
    },
    musicUpload: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  return {
    tx,
    prisma: {
      musicArtist: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'a1', ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'a1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      musicAlbum: {
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue({}),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'al1', ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'al1', ...data })),
      },
      musicCategory: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'c1', ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'c1', ...data })),
        delete: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
      musicTrack: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    },
  };
}

/**
 * Обложки — настоящим сервисом поверх ненастроенного хранилища: он чистый,
 * в базу и в S3 не ходит, а подменять его заглушкой значило бы проверять
 * ключи не тем кодом, который работает в проде.
 */
function storageService() {
  return new MusicStorageService({
    get: () => undefined,
  } as unknown as ConfigService);
}

function coversService(storage: MusicStorageService) {
  return new MusicCoversService(storage);
}

function service(
  mock: ReturnType<typeof prismaMock>,
  storage = storageService(),
) {
  return new MusicAdminCatalogService(
    mock.prisma as unknown as PrismaService,
    coversService(storage),
    storage,
  );
}

describe('MusicAdminCatalogService', () => {
  describe('setTracksArtist (VED-226)', () => {
    function withTracks(ids: string[]) {
      const mock = prismaMock();
      mock.prisma.musicTrack.findMany.mockResolvedValue(
        ids.map((id) => ({ id })),
      );
      mock.prisma.musicTrack.updateMany.mockResolvedValue({
        count: ids.length,
      });
      return mock;
    }

    it('не пускает не-администратора', async () => {
      await expect(
        service(prismaMock()).setTracksArtist(false, {
          trackIds: ['t1'],
          artistName: 'X',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('переносит к найденному по имени без учёта регистра', async () => {
      const mock = withTracks(['t1', 't2']);
      mock.prisma.musicArtist.findFirst.mockResolvedValue({
        id: 'a7',
        name: 'Aindra das',
        slug: 'aindra-das',
      });

      const result = await service(mock).setTracksArtist(true, {
        trackIds: ['t1', 't2'],
        artistName: ' AINDRA  DAS ',
      });

      expect(mock.prisma.musicArtist.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { equals: 'AINDRA DAS', mode: 'insensitive' } },
        }),
      );
      expect(mock.prisma.musicArtist.create).not.toHaveBeenCalled();
      expect(mock.prisma.musicTrack.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1', 't2'] } },
        data: { artistId: 'a7' },
      });
      expect(result).toEqual({
        artist: { id: 'a7', name: 'Aindra das', slug: 'aindra-das' },
        created: false,
        updated: 2,
      });
    });

    it('заводит исполнителя, если такого нет', async () => {
      const mock = withTracks(['t1']);

      const result = await service(mock).setTracksArtist(true, {
        trackIds: ['t1'],
        artistName: 'Гаура дас',
      });

      expect(mock.prisma.musicArtist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Гаура дас', slug: 'gaura-das' }),
      });
      expect(result.created).toBe(true);
      expect(result.artist).toEqual({
        id: 'a1',
        name: 'Гаура дас',
        slug: 'gaura-das',
      });
      expect(mock.prisma.musicTrack.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1'] } },
        data: { artistId: 'a1' },
      });
    });

    it('по идентификатору — только к существующему', async () => {
      const mock = withTracks(['t1']);
      await expect(
        service(mock).setTracksArtist(true, {
          trackIds: ['t1'],
          artistId: 'missing',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mock.prisma.musicTrack.updateMany).not.toHaveBeenCalled();
    });

    it('artistId: null снимает исполнителя', async () => {
      const mock = withTracks(['t1']);
      const result = await service(mock).setTracksArtist(true, {
        trackIds: ['t1'],
        artistId: null,
      });
      expect(mock.prisma.musicTrack.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1'] } },
        data: { artistId: null },
      });
      expect(result).toEqual({ artist: null, created: false, updated: 1 });
    });

    it('не трогает ничего, если часть записей пропала', async () => {
      const mock = withTracks(['t1']);
      await expect(
        service(mock).setTracksArtist(true, {
          trackIds: ['t1', 'gone'],
          artistName: 'X',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mock.prisma.musicArtist.create).not.toHaveBeenCalled();
      expect(mock.prisma.musicTrack.updateMany).not.toHaveBeenCalled();
    });

    it('кривое тело — 400', async () => {
      await expect(
        service(prismaMock()).setTracksArtist(true, { trackIds: [] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('setArtistsRootCategory (VED-165-2)', () => {
    function withArtists(ids: string[]) {
      const mock = prismaMock();
      mock.prisma.musicArtist.findMany.mockResolvedValue(
        ids.map((id) => ({ id })),
      );
      mock.prisma.musicArtist.updateMany.mockResolvedValue({
        count: ids.length,
      });
      return mock;
    }

    it('не пускает не-администратора', async () => {
      await expect(
        service(prismaMock()).setArtistsRootCategory(false, {
          artistIds: ['a1'],
          rootCategoryId: 'root-new',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('пустой список исполнителей — 400', async () => {
      await expect(
        service(prismaMock()).setArtistsRootCategory(true, {
          artistIds: [],
          rootCategoryId: 'root-new',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('несуществующая категория — 400, до похода за исполнителями', async () => {
      const mock = withArtists(['a1']);
      mock.prisma.musicCategory.findUnique.mockResolvedValue(null);

      await expect(
        service(mock).setArtistsRootCategory(true, {
          artistIds: ['a1'],
          rootCategoryId: 'missing',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mock.prisma.musicArtist.findMany).not.toHaveBeenCalled();
    });

    it('стилевую категорию корневой не поставить — 400', async () => {
      const mock = withArtists(['a1']);
      mock.prisma.musicCategory.findUnique.mockResolvedValue({
        id: 'style-mantra',
        kind: 'style',
      });

      await expect(
        service(mock).setArtistsRootCategory(true, {
          artistIds: ['a1'],
          rootCategoryId: 'style-mantra',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('не трогает ничего, если часть исполнителей пропала', async () => {
      const mock = withArtists(['a1']);
      mock.prisma.musicCategory.findUnique.mockResolvedValue({
        id: 'root-new',
        kind: 'root',
      });

      await expect(
        service(mock).setArtistsRootCategory(true, {
          artistIds: ['a1', 'gone'],
          rootCategoryId: 'root-new',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mock.prisma.musicArtist.updateMany).not.toHaveBeenCalled();
    });

    it('ставит корневую выбранным исполнителям одним updateMany', async () => {
      const mock = withArtists(['a1', 'a2']);
      mock.prisma.musicCategory.findUnique.mockResolvedValue({
        id: 'root-new',
        kind: 'root',
      });

      const result = await service(mock).setArtistsRootCategory(true, {
        artistIds: ['a1', 'a2'],
        rootCategoryId: 'root-new',
      });

      expect(result).toEqual({ updated: 2 });
      expect(mock.prisma.musicArtist.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2'] } },
        data: { rootCategoryId: 'root-new' },
      });
    });

    it('rootCategoryId: null снимает корневую без похода в справочник категорий', async () => {
      const mock = withArtists(['a1']);

      const result = await service(mock).setArtistsRootCategory(true, {
        artistIds: ['a1'],
        rootCategoryId: null,
      });

      expect(result).toEqual({ updated: 1 });
      expect(mock.prisma.musicCategory.findUnique).not.toHaveBeenCalled();
      expect(mock.prisma.musicArtist.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1'] } },
        data: { rootCategoryId: null },
      });
    });
  });

  describe('createArtist / updateArtist — rootCategoryId (VED-165-2)', () => {
    it('создание с корневой категорией стиля — 400', async () => {
      const mock = prismaMock();
      mock.prisma.musicCategory.findUnique.mockResolvedValue({
        id: 'style-mantra',
        kind: 'style',
      });

      await expect(
        service(mock).createArtist(true, {
          name: 'Гаура дас',
          rootCategoryId: 'style-mantra',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('создание с настоящей корневой — проходит и попадает в data', async () => {
      const mock = prismaMock();
      mock.prisma.musicCategory.findUnique.mockResolvedValue({
        id: 'root-new',
        kind: 'root',
      });

      await service(mock).createArtist(true, {
        name: 'Гаура дас',
        rootCategoryId: 'root-new',
      });

      expect(mock.prisma.musicArtist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ rootCategoryId: 'root-new' }),
      });
    });

    it('правка снимает корневую через null, не трогая остальное', async () => {
      const mock = prismaMock();
      mock.prisma.musicArtist.findUnique.mockResolvedValue({
        id: 'a1',
        coverKey: null,
      });

      await service(mock).updateArtist(true, 'a1', { rootCategoryId: null });

      expect(mock.prisma.musicCategory.findUnique).not.toHaveBeenCalled();
      expect(mock.prisma.musicArtist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { rootCategoryId: null },
      });
    });

    it('правка со стилевой категорией — 400, update не зовётся', async () => {
      const mock = prismaMock();
      mock.prisma.musicArtist.findUnique.mockResolvedValue({
        id: 'a1',
        coverKey: null,
      });
      mock.prisma.musicCategory.findUnique.mockResolvedValue({
        id: 'style-mantra',
        kind: 'style',
      });

      await expect(
        service(mock).updateArtist(true, 'a1', {
          rootCategoryId: 'style-mantra',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mock.prisma.musicArtist.update).not.toHaveBeenCalled();
    });
  });

  describe('права', () => {
    it('не пускает не-администратора никуда', async () => {
      const svc = service(prismaMock());

      await expect(svc.createArtist(false, { name: 'Х' })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(svc.createAlbum(false, { title: 'Х' })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(svc.createCategory(false, { title: 'Х' })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(svc.updateTrack(false, 't1', {})).rejects.toThrow(
        ForbiddenException,
      );
      await expect(svc.deleteTrack(false, 't1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createArtist', () => {
    it('делает слаг из имени', async () => {
      const mock = prismaMock();

      await service(mock).createArtist(true, { name: 'Аударья Дхама дас' });

      expect(mock.prisma.musicArtist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'audarya-dhama-das' }),
      });
    });

    it('разводит одноимённых исполнителей суффиксом', async () => {
      const mock = prismaMock();
      // Заняты и чистый слаг, и `-2`: третий тёзка должен получить `-3`.
      mock.prisma.musicArtist.findUnique.mockImplementation(({ where }) =>
        where.slug === 'gaura-das' || where.slug === 'gaura-das-2'
          ? { id: 'taken' }
          : null,
      );

      await service(mock).createArtist(true, { name: 'Гаура дас' });

      expect(mock.prisma.musicArtist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'gaura-das-3' }),
      });
    });

    it('пустое имя отклоняет', async () => {
      const mock = prismaMock();

      await expect(
        service(mock).createArtist(true, { name: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('по умолчанию исполнитель неизвестного вида и без отметки', async () => {
      const mock = prismaMock();

      await service(mock).createArtist(true, { name: 'Хор' });

      expect(mock.prisma.musicArtist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'unknown', isVerified: false }),
      });
    });
  });

  describe('updateArtist', () => {
    it('не переписывает слаг вслед за именем — по нему ушли ссылки', async () => {
      const mock = prismaMock();
      mock.prisma.musicArtist.findUnique.mockResolvedValue({ id: 'a1' });

      await service(mock).updateArtist(true, 'a1', { name: 'Новое имя' });

      const data = mock.prisma.musicArtist.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('slug');
      expect(data.name).toBe('Новое имя');
    });

    it('несуществующего не находит', async () => {
      const mock = prismaMock();

      await expect(
        service(mock).updateArtist(true, 'нет', { name: 'Х' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAlbum', () => {
    it('отклоняет ссылку на несуществующего исполнителя', async () => {
      const mock = prismaMock();

      await expect(
        service(mock).createAlbum(true, {
          title: 'Программа',
          artistId: 'нет',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('проверяет год на разумность', async () => {
      const mock = prismaMock();

      await expect(
        service(mock).createAlbum(true, { title: 'Программа', year: 1200 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service(mock).createAlbum(true, { title: 'Программа', year: 20260 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('пустой год — это отсутствие года, а не ошибка', async () => {
      const mock = prismaMock();

      await service(mock).createAlbum(true, { title: 'Программа' });

      expect(mock.prisma.musicAlbum.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ year: null }),
      });
    });
  });

  describe('deleteCategory', () => {
    it('удаляет ярлык, не трогая записи', async () => {
      const mock = prismaMock();
      mock.prisma.musicCategory.findUnique.mockResolvedValue({ id: 'c1' });

      await service(mock).deleteCategory(true, 'c1');

      expect(mock.prisma.musicCategory.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });
  });

  describe('удаление справочников', () => {
    // Каскада нет намеренно: FK у записи `SetNull`, и удаление живого
    // исполнителя не унесло бы записи, а молча обезличило их.
    it('исполнителя с записями не удаляет, а объясняет почему', async () => {
      const mock = prismaMock();
      mock.prisma.musicArtist.findUnique.mockResolvedValue({
        id: 'a1',
        _count: { tracks: 12, albums: 2 },
      });

      await expect(service(mock).deleteArtist(true, 'a1')).rejects.toThrow(
        /перевесьте/,
      );
      expect(mock.prisma.musicArtist.delete).not.toHaveBeenCalled();
    });

    it('пустого исполнителя удаляет', async () => {
      const mock = prismaMock();
      mock.prisma.musicArtist.findUnique.mockResolvedValue({
        id: 'a1',
        _count: { tracks: 0, albums: 0 },
      });

      await service(mock).deleteArtist(true, 'a1');

      expect(mock.prisma.musicArtist.delete).toHaveBeenCalledWith({
        where: { id: 'a1' },
      });
    });

    it('альбом с записями не удаляет', async () => {
      const mock = prismaMock();
      mock.prisma.musicAlbum.findUnique.mockResolvedValue({
        id: 'al1',
        _count: { tracks: 3 },
      });

      await expect(service(mock).deleteAlbum(true, 'al1')).rejects.toThrow(
        /перевесьте/,
      );
      expect(mock.prisma.musicAlbum.delete).not.toHaveBeenCalled();
    });

    it('пустой альбом удаляет', async () => {
      const mock = prismaMock();
      mock.prisma.musicAlbum.findUnique.mockResolvedValue({
        id: 'al1',
        _count: { tracks: 0 },
      });

      await service(mock).deleteAlbum(true, 'al1');

      expect(mock.prisma.musicAlbum.delete).toHaveBeenCalledWith({
        where: { id: 'al1' },
      });
    });

    it('несуществующего не выдумывает', async () => {
      const mock = prismaMock();

      await expect(service(mock).deleteArtist(true, 'нет')).rejects.toThrow(
        /не найден/,
      );
    });
  });

  describe('updateTrack', () => {
    const existing = { id: 't1', status: 'pending', publishedAt: null };

    it('дату публикации проставляет один раз', async () => {
      const mock = prismaMock();
      mock.prisma.musicTrack.findUnique.mockResolvedValue(existing);

      await service(mock).updateTrack(true, 't1', { status: 'published' });

      expect(
        mock.tx.musicTrack.update.mock.calls[0][0].data.publishedAt,
      ).toBeInstanceOf(Date);
    });

    it('повторная публикация не поднимает запись в «Новом» заново', async () => {
      const mock = prismaMock();
      mock.prisma.musicTrack.findUnique.mockResolvedValue({
        ...existing,
        status: 'hidden',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service(mock).updateTrack(true, 't1', { status: 'published' });

      expect(
        mock.tx.musicTrack.update.mock.calls[0][0].data,
      ).not.toHaveProperty('publishedAt');
    });

    it('заменяет категории целиком, а не дописывает', async () => {
      const mock = prismaMock();
      mock.prisma.musicTrack.findUnique.mockResolvedValue(existing);
      mock.tx.musicCategory.findMany.mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
      ]);

      await service(mock).updateTrack(true, 't1', {
        categoryIds: ['c1', 'c2', 'c1'],
      });

      expect(mock.tx.musicTrackCategory.deleteMany).toHaveBeenCalledWith({
        where: { trackId: 't1' },
      });
      // Дубль в запросе схлопнут: связь у пары одна, вторая упала бы на @@id.
      expect(mock.tx.musicTrackCategory.createMany).toHaveBeenCalledWith({
        data: [
          { trackId: 't1', categoryId: 'c1' },
          { trackId: 't1', categoryId: 'c2' },
        ],
      });
    });

    it('несуществующую категорию отклоняет и связи не трогает', async () => {
      const mock = prismaMock();
      mock.prisma.musicTrack.findUnique.mockResolvedValue(existing);
      mock.tx.musicCategory.findMany.mockResolvedValue([{ id: 'c1' }]);

      await expect(
        service(mock).updateTrack(true, 't1', { categoryIds: ['c1', 'нет'] }),
      ).rejects.toThrow(BadRequestException);

      expect(mock.tx.musicTrackCategory.deleteMany).not.toHaveBeenCalled();
    });

    it('пустой список категорий снимает все', async () => {
      const mock = prismaMock();
      mock.prisma.musicTrack.findUnique.mockResolvedValue(existing);

      await service(mock).updateTrack(true, 't1', { categoryIds: [] });

      expect(mock.tx.musicTrackCategory.deleteMany).toHaveBeenCalled();
      expect(mock.tx.musicTrackCategory.createMany).not.toHaveBeenCalled();
    });

    it('не даёт подменить файл через правку карточки', async () => {
      const mock = prismaMock();
      mock.prisma.musicTrack.findUnique.mockResolvedValue(existing);

      await service(mock).updateTrack(true, 't1', {
        title: 'Новое название',
        // Поля нет в UpdateMusicTrackRequest, но клиент может его прислать.
        ...({ storageKey: 'music/чужое.mp3' } as Record<string, unknown>),
      });

      const data = mock.tx.musicTrack.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('storageKey');
    });
  });

  describe('deleteTrack', () => {
    const existing = {
      id: 't1',
      storageKey: 'music/t1.mp3',
      coverKey: 'covers/t1.jpg',
    };

    it('несуществующую запись не удаляет', async () => {
      const mock = prismaMock();

      await expect(service(mock).deleteTrack(true, 't1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mock.tx.musicTrack.delete).not.toHaveBeenCalled();
    });

    it('уносит строку загрузки: FK на запись у неё нет, каскад её не заберёт', async () => {
      const mock = prismaMock();
      mock.prisma.musicTrack.findUnique.mockResolvedValue(existing);

      await service(mock).deleteTrack(true, 't1');

      expect(mock.tx.musicUpload.deleteMany).toHaveBeenCalledWith({
        where: { storageKey: 'music/t1.mp3' },
      });
      expect(mock.tx.musicTrack.delete).toHaveBeenCalledWith({
        where: { id: 't1' },
      });
    });

    it('файл и обложку убирает после базы', async () => {
      const mock = prismaMock();
      mock.prisma.musicTrack.findUnique.mockResolvedValue(existing);

      const storage = storageService();
      const remove = jest.spyOn(storage, 'remove').mockResolvedValue();

      await service(mock, storage).deleteTrack(true, 't1');

      expect(remove).toHaveBeenCalledWith('music/t1.mp3');
      expect(remove).toHaveBeenCalledWith('covers/t1.jpg');
      // Порядок важен: осиротевший объект найдёт чистка, а строка,
      // ссылающаяся в пустоту, останется навсегда.
      expect(
        mock.tx.musicTrack.delete.mock.invocationCallOrder[0],
      ).toBeLessThan(remove.mock.invocationCallOrder[0]);
    });
  });
});
