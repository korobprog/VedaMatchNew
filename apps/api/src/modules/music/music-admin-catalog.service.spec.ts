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
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicTrack: {
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 't1', ...data })),
    },
  };

  return {
    tx,
    prisma: {
      musicArtist: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'a1', ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'a1', ...data })),
      },
      musicAlbum: {
        findUnique: jest.fn().mockResolvedValue(null),
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
function coversService() {
  return new MusicCoversService(
    new MusicStorageService({
      get: () => undefined,
    } as unknown as ConfigService),
  );
}

function service(mock: ReturnType<typeof prismaMock>) {
  return new MusicAdminCatalogService(
    mock.prisma as unknown as PrismaService,
    coversService(),
  );
}

describe('MusicAdminCatalogService', () => {
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
});
