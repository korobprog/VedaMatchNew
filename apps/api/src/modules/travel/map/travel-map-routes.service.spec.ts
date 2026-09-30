/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- вызовы jest.fn() типизируются как any */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { TravelMapPhotosService } from './travel-map-photos.service';
import { TravelMapRoutesService } from './travel-map-routes.service';

const author = { sub: 'u1' } as AccessTokenPayload;
const stranger = { sub: 'u2' } as AccessTokenPayload;
const admin = { sub: 'a1', role: 'admin' } as AccessTokenPayload;

function routeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    kind: 'parikrama',
    name: 'Вриндаван',
    description: '',
    city: null,
    country: null,
    stopsCount: 2,
    distanceKm: 1,
    startLat: 55.7558,
    startLng: 37.6173,
    status: 'active',
    hiddenReason: null,
    authorId: 'u1',
    author: { id: 'u1', name: 'Иван', spiritualName: null, isAgent: false },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    stops: [],
    ...over,
  };
}

function setup() {
  const prisma: Record<string, any> = {
    travelMapRoute: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn().mockResolvedValue(routeRow()),
      delete: jest.fn().mockResolvedValue({}),
    },
    travelMapRouteStop: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    travelMapPlace: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  const photos = {
    uploadImage: jest.fn().mockResolvedValue({ key: 'k-new', url: 'u-new' }),
    uploadVideo: jest.fn().mockResolvedValue({ key: 'v-new', url: 'vu-new' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TravelMapRoutesService(
    prisma as unknown as PrismaService,
    photos as unknown as TravelMapPhotosService,
  );
  return { prisma, photos, service };
}

const moscow = { name: 'Москва', lat: 55.7558, lng: 37.6173 };
const spb = { name: 'Петербург', lat: 59.9343, lng: 30.3351 };
const body = (over: Record<string, unknown> = {}) => ({
  kind: 'city_walk',
  name: 'Прогулка',
  stops: [moscow, spb],
  ...over,
});

describe('TravelMapRoutesService', () => {
  describe('create', () => {
    it('считает distanceKm, stopsCount, старт и позиции', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue(routeRow());
      await service.create(author, body());
      const data = prisma.travelMapRoute.create.mock.calls[0][0].data;
      expect(data.stopsCount).toBe(2);
      expect(Math.abs(data.distanceKm - 634)).toBeLessThan(5);
      expect(data.startLat).toBe(moscow.lat);
      expect(data.startLng).toBe(moscow.lng);
      expect(data.authorId).toBe('u1');
      const rows = prisma.travelMapRouteStop.createMany.mock.calls[0][0].data;
      expect(rows.map((r: { position: number }) => r.position)).toEqual([0, 1]);
    });

    it('чужой или несуществующий placeId — 400', async () => {
      const { prisma, service } = setup();
      prisma.travelMapPlace.findMany.mockResolvedValue([]);
      await expect(
        service.create(
          author,
          body({ stops: [{ ...moscow, placeId: 'x' }, spb] }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.travelMapPlace.findMany.mock.calls[0][0].where).toEqual({
        id: { in: ['x'] },
        status: 'active',
      });
    });

    it('меньше двух остановок — 400', async () => {
      const { service } = setup();
      await expect(
        service.create(author, body({ stops: [moscow] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('get', () => {
    it('скрытый маршрут постороннему — 404, автору и админу виден', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue(
        routeRow({ status: 'hidden' }),
      );
      await expect(service.get(stranger, 'r1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect((await service.get(author, 'r1')).canEdit).toBe(true);
      expect((await service.get(admin, 'r1')).canEdit).toBe(true);
    });

    it('отдаёт снимок места остановки', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue(
        routeRow({
          stops: [
            {
              id: 's1',
              position: 0,
              placeId: 'p1',
              name: 'Храм',
              lat: 1,
              lng: 2,
              note: '',
              place: {
                kind: 'temple',
                photoUrls: ['u0'],
                lastConfirmedAt: null,
                updatedAt: new Date(),
              },
            },
            {
              id: 's2',
              position: 1,
              placeId: null,
              name: 'Точка',
              lat: 1,
              lng: 3,
              note: '',
              place: null,
            },
          ],
        }),
      );
      const dto = await service.get(stranger, 'r1');
      expect(dto.stops[0].place).toEqual({
        kind: 'temple',
        photoUrl: 'u0',
        stale: false,
      });
      expect(dto.stops[1].place).toBeNull();
      expect(dto.canEdit).toBe(false);
    });
  });

  describe('list', () => {
    it('фильтрует активные, по рамке и виду; ставит truncated', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findMany.mockResolvedValue(
        Array.from({ length: 201 }, (_, i) => routeRow({ id: `r${i}` })),
      );
      const res = await service.list(author, {
        minLat: '1',
        maxLat: '2',
        minLng: '3',
        maxLng: '4',
        kinds: 'trail,bogus',
        q: 'вр',
      });
      expect(res.truncated).toBe(true);
      expect(res.routes).toHaveLength(200);
      const args = prisma.travelMapRoute.findMany.mock.calls[0][0];
      expect(args.take).toBe(201);
      expect(args.where.status).toBe('active');
      expect(args.where.startLat).toEqual({ gte: 1, lte: 2 });
      expect(args.where.kind).toEqual({ in: ['trail'] });
      expect(args.where.OR).toHaveLength(2);
    });

    it('половина рамки — 400', async () => {
      const { service } = setup();
      await expect(
        service.list(author, { minLat: '1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('со stops: id сохраняется, новая создаётся, пропавшая удаляется с ключами S3', async () => {
      const { prisma, photos, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue(routeRow());
      prisma.travelMapRouteStop.findMany.mockResolvedValue([
        { id: 's1', photoKeys: ['a'], videoKey: null },
        { id: 's2', photoKeys: ['b', 'c'], videoKey: 'v' },
      ]);
      await service.update(author, 'r1', {
        stops: [spb, { ...moscow, id: 's1' }],
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.travelMapRouteStop.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['s2'] } },
      });
      // s1 сначала уходит в отрицательную позицию, затем получает итоговую.
      const updates = prisma.travelMapRouteStop.update.mock.calls.map(
        (c: any[]) => c[0],
      );
      expect(updates[0]).toEqual({
        where: { id: 's1' },
        data: { position: -1 },
      });
      expect(updates[1].where).toEqual({ id: 's1' });
      expect(updates[1].data.position).toBe(1);
      // Медиа-поля при правке не трогаем.
      expect(updates[1].data).not.toHaveProperty('photoKeys');
      expect(updates[1].data).not.toHaveProperty('story');
      const created = prisma.travelMapRouteStop.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ routeId: 'r1', position: 0 });
      expect(photos.remove.mock.calls.map((c: any[]) => c[0])).toEqual([
        'b',
        'c',
        'v',
      ]);
      const data = prisma.travelMapRoute.update.mock.calls[0][0].data;
      expect(data.startLat).toBe(spb.lat);
      expect(data.stopsCount).toBe(2);
    });

    it('чужой id остановки — 400, S3 не трогаем', async () => {
      const { prisma, photos, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue(routeRow());
      prisma.travelMapRouteStop.findMany.mockResolvedValue([
        { id: 's1', photoKeys: ['a'], videoKey: null },
      ]);
      await expect(
        service.update(author, 'r1', {
          stops: [{ ...moscow, id: 'alien' }, spb],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(photos.remove).not.toHaveBeenCalled();
    });

    it('без stops остановки не трогает', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue(routeRow());
      await service.update(author, 'r1', { name: 'Новое' });
      expect(prisma.travelMapRouteStop.deleteMany).not.toHaveBeenCalled();
      expect(prisma.travelMapRoute.update.mock.calls[0][0].data).toEqual({
        name: 'Новое',
      });
    });

    it('чужой — 403', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue(routeRow());
      await expect(
        service.update(stranger, 'r1', { name: 'Новое' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('автор и админ удаляют, чужой — 403', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue({
        id: 'r1',
        authorId: 'u1',
        stops: [],
      });
      await expect(service.remove(stranger, 'r1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await service.remove(admin, 'r1');
      expect(prisma.travelMapRoute.delete).toHaveBeenCalledWith({
        where: { id: 'r1' },
      });
    });

    it('после удаления чистит медиа всех остановок', async () => {
      const { prisma, photos, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue({
        id: 'r1',
        authorId: 'u1',
        stops: [
          { photoKeys: ['a', 'b'], videoKey: 'v' },
          { photoKeys: [], videoKey: null },
        ],
      });
      await service.remove(author, 'r1');
      expect(photos.remove.mock.calls.map((c: any[]) => c[0])).toEqual([
        'a',
        'b',
        'v',
      ]);
    });
  });

  describe('медиа остановки', () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1 };
    function withStop(
      prisma: Record<string, any>,
      over: Record<string, unknown> = {},
    ) {
      prisma.travelMapRoute.findUnique.mockResolvedValue(
        routeRow({ stops: [] }),
      );
      prisma.travelMapRouteStop.findUnique.mockResolvedValue({
        id: 's1',
        routeId: 'r1',
        photoKeys: ['a'],
        photoUrls: ['ua'],
        videoKey: 'old-v',
        ...over,
      });
    }

    it('шестое фото после шести — 400', async () => {
      const { prisma, photos, service } = setup();
      const six = ['1', '2', '3', '4', '5', '6'];
      withStop(prisma, { photoKeys: six, photoUrls: six });
      await expect(
        service.addStopPhoto(author, 'r1', 's1', file),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(photos.uploadImage).not.toHaveBeenCalled();
    });

    it('фото дописывается с префиксом остановки', async () => {
      const { prisma, photos, service } = setup();
      withStop(prisma);
      await service.addStopPhoto(author, 'r1', 's1', file);
      expect(photos.uploadImage).toHaveBeenCalledWith(
        'travel/map/routes/r1/s1',
        file,
      );
      expect(prisma.travelMapRouteStop.update.mock.calls[0][0].data).toEqual({
        photoKeys: { push: 'k-new' },
        photoUrls: { push: 'u-new' },
      });
    });

    it('остановка другого маршрута — 404', async () => {
      const { prisma, service } = setup();
      withStop(prisma, { routeId: 'other' });
      await expect(
        service.addStopPhoto(author, 'r1', 's1', file),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('не-автор — 403', async () => {
      const { prisma, service } = setup();
      withStop(prisma);
      await expect(
        service.updateStopStory(stranger, 'r1', 's1', { story: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('удаление фото убирает пару и ключ из S3; плохой индекс — 404', async () => {
      const { prisma, photos, service } = setup();
      withStop(prisma);
      await expect(
        service.removeStopPhoto(author, 'r1', 's1', 3),
      ).rejects.toBeInstanceOf(NotFoundException);
      await service.removeStopPhoto(author, 'r1', 's1', 0);
      expect(prisma.travelMapRouteStop.update.mock.calls[0][0].data).toEqual({
        photoKeys: [],
        photoUrls: [],
      });
      expect(photos.remove).toHaveBeenCalledWith('a');
    });

    it('замена видео удаляет старый ключ', async () => {
      const { prisma, photos, service } = setup();
      withStop(prisma);
      await service.setStopVideo(author, 'r1', 's1', file);
      expect(prisma.travelMapRouteStop.update.mock.calls[0][0].data).toEqual({
        videoKey: 'v-new',
        videoUrl: 'vu-new',
      });
      expect(photos.remove).toHaveBeenCalledWith('old-v');
    });

    it('удаление видео обнуляет поля и чистит S3', async () => {
      const { prisma, photos, service } = setup();
      withStop(prisma);
      await service.removeStopVideo(author, 'r1', 's1');
      expect(prisma.travelMapRouteStop.update.mock.calls[0][0].data).toEqual({
        videoKey: null,
        videoUrl: null,
      });
      expect(photos.remove).toHaveBeenCalledWith('old-v');
    });

    it('рассказ обрезается, длиннее 4000 — 400', async () => {
      const { prisma, service } = setup();
      withStop(prisma);
      await service.updateStopStory(author, 'r1', 's1', { story: '  Привет ' });
      expect(prisma.travelMapRouteStop.update.mock.calls[0][0].data).toEqual({
        story: 'Привет',
      });
      await expect(
        service.updateStopStory(author, 'r1', 's1', {
          story: 'a'.repeat(4001),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('администрация', () => {
    it('не-админ на adminHide и adminList — 403', async () => {
      const { service } = setup();
      await expect(service.adminHide(author, 'r1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.adminList(author, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('adminHide и adminUnhide меняют статус', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue({ id: 'r1' });
      await service.adminHide(admin, 'r1', { reason: 'дубль' });
      expect(prisma.travelMapRoute.update.mock.calls[0][0].data).toEqual({
        status: 'hidden',
        hiddenReason: 'дубль',
      });
      await service.adminUnhide(admin, 'r1');
      expect(prisma.travelMapRoute.update.mock.calls[1][0].data).toEqual({
        status: 'active',
        hiddenReason: null,
      });
    });

    it('adminList включает скрытые, take 200', async () => {
      const { prisma, service } = setup();
      await service.adminList(admin, {});
      const args = prisma.travelMapRoute.findMany.mock.calls[0][0];
      expect(args.where.status).toBeUndefined();
      expect(args.take).toBe(200);
    });
  });
});
