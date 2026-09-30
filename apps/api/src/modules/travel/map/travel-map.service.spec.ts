/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- вызовы jest.fn() типизируются как any */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { TravelMapPhotosService } from './travel-map-photos.service';
import { TravelMapService } from './travel-map.service';

const author = { sub: 'u1' } as AccessTokenPayload;
const stranger = { sub: 'u2' } as AccessTokenPayload;
const admin = { sub: 'a1', role: 'admin' } as AccessTokenPayload;

function placeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    kind: 'temple',
    name: 'Храм',
    description: '',
    address: '',
    lat: 1,
    lng: 2,
    city: 'Москва',
    country: null,
    lineage: null,
    openingHours: null,
    website: null,
    phone: null,
    telegram: null,
    photoKeys: ['k0'],
    photoUrls: ['u0'],
    status: 'active',
    hiddenReason: 'дубль',
    verifiedAt: null,
    verifiedById: null,
    createdById: 'u1',
    createdBy: { id: 'u1', name: 'Иван', spiritualName: null, isAgent: false },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...over,
  };
}

function setup() {
  const prisma = {
    travelMapPlace: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    travelMapPlaceReport: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    community: { findMany: jest.fn().mockResolvedValue([]) },
    travelStay: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const photos = {
    upload: jest.fn().mockResolvedValue({ key: 'k1', url: 'u1' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TravelMapService(
    prisma as unknown as PrismaService,
    photos as unknown as TravelMapPhotosService,
  );
  return { prisma, photos, service };
}

describe('TravelMapService.listPlaces', () => {
  it('фильтрует активные, по рамке и видам, берёт на одну строку больше лимита', async () => {
    const { prisma, service } = setup();
    await service.listPlaces(author, {
      minLat: '1',
      maxLat: '2',
      minLng: '3',
      maxLng: '4',
      kinds: 'temple',
      q: 'мос',
    });
    const args = prisma.travelMapPlace.findMany.mock.calls[0][0];
    expect(args.take).toBe(501);
    expect(args.where.status).toBe('active');
    expect(args.where.lat).toEqual({ gte: 1, lte: 2 });
    expect(args.where.kind).toEqual({ in: ['temple'] });
    expect(args.where.OR).toHaveLength(2);
    const communities = prisma.community.findMany.mock.calls[0][0];
    expect(communities.where.status).toBe('active');
    expect(communities.where.latitude).toEqual({ gte: 1, lte: 2 });
    expect(communities.take).toBe(500);
    const stays = prisma.travelStay.findMany.mock.calls[0][0];
    expect(stays.where.status).toBe('published');
    expect(stays.where.lat).toEqual({ gte: 1, lte: 2 });
    expect(stays.where.lng).toEqual({ gte: 3, lte: 4 });
    expect(stays.where.name).toEqual({ contains: 'мос', mode: 'insensitive' });
    expect(stays.take).toBe(500);
  });

  it('stays=0: слой ночлега не читается, ответ пустой', async () => {
    const { prisma, service } = setup();
    const res = await service.listPlaces(author, { stays: '0' });
    expect(res.stays).toEqual([]);
    expect(prisma.travelStay.findMany).not.toHaveBeenCalled();
  });

  it('ночлег превращается в точки, фото — первое или null', async () => {
    const { prisma, service } = setup();
    const base = {
      kind: 'hostel',
      name: 'Хостел',
      address: 'ул. 1',
      payment: 'paid',
      priceMinor: 150000,
      currency: 'rub',
    };
    prisma.travelStay.findMany.mockResolvedValue([
      { ...base, id: 's1', lat: 5, lng: 6, photoUrls: ['a', 'b'] },
      { ...base, id: 's2', lat: 7, lng: 8, photoUrls: [], priceMinor: null },
      { ...base, id: 's3', lat: null, lng: null, photoUrls: [] },
    ]);
    const res = await service.listPlaces(author, {});
    expect(res.stays).toEqual([
      { ...base, id: 's1', lat: 5, lng: 6, photoUrl: 'a' },
      { ...base, id: 's2', lat: 7, lng: 8, priceMinor: null, photoUrl: null },
    ]);
  });

  it('truncated при 501 строке, лишняя отрезается', async () => {
    const { prisma, service } = setup();
    prisma.travelMapPlace.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({
        ...placeRow({ id: `p${i}` }),
      })),
    );
    const res = await service.listPlaces(author, { communities: '0' });
    expect(res.truncated).toBe(true);
    expect(res.points).toHaveLength(500);
    expect(prisma.community.findMany).not.toHaveBeenCalled();
  });

  it('общины превращаются в точки', async () => {
    const { prisma, service } = setup();
    prisma.community.findMany.mockResolvedValue([
      {
        id: 'c1',
        slug: 'x',
        kind: 'temple',
        name: 'Община',
        latitude: 5,
        longitude: 6,
        city: null,
        verifiedAt: new Date(),
      },
    ]);
    const res = await service.listPlaces(author, {});
    expect(res.communities).toEqual([
      {
        id: 'c1',
        slug: 'x',
        kind: 'temple',
        name: 'Община',
        lat: 5,
        lng: 6,
        city: null,
        verified: true,
      },
    ]);
  });
});

describe('TravelMapService.getPlace', () => {
  it('скрытое видят автор и админ, остальным 404', async () => {
    const { prisma, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue(
      placeRow({ status: 'hidden' }),
    );
    await expect(service.getPlace(stranger, 'p1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getPlace(author, 'p1')).resolves.toMatchObject({
      canEdit: true,
      hiddenReason: 'дубль',
    });
    await expect(service.getPlace(admin, 'p1')).resolves.toMatchObject({
      canEdit: true,
    });
  });

  it('чужой не видит причину скрытия и не может править', async () => {
    const { prisma, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue(placeRow());
    const dto = await service.getPlace(stranger, 'p1');
    expect(dto.canEdit).toBe(false);
    expect(dto.hiddenReason).toBeNull();
    expect(dto.photoUrl).toBe('u0');
    expect(dto.verified).toBe(false);
    expect(dto.author).toEqual({ id: 'u1', name: 'Иван', isAgent: false });
  });
});

describe('TravelMapService: правка и удаление', () => {
  it('чужое место править нельзя', async () => {
    const { prisma, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue(placeRow());
    await expect(
      service.updatePlace(stranger, 'p1', { name: 'Другое' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.travelMapPlace.update).not.toHaveBeenCalled();
  });

  it('удаление стирает фото из хранилища', async () => {
    const { prisma, photos, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue(
      placeRow({ photoKeys: ['a', 'b'] }),
    );
    await service.deletePlace(author, 'p1');
    expect(prisma.travelMapPlace.delete).toHaveBeenCalledWith({
      where: { id: 'p1' },
    });
    expect(photos.remove).toHaveBeenCalledTimes(2);
  });
});

describe('TravelMapService: фото', () => {
  const file = { buffer: Buffer.from('x'), mimetype: 'image/png', size: 1 };

  it('не больше десяти', async () => {
    const { prisma, photos, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue(
      placeRow({
        photoKeys: Array(10).fill('k'),
        photoUrls: Array(10).fill('u'),
      }),
    );
    await expect(service.addPhoto(author, 'p1', file)).rejects.toThrow(
      BadRequestException,
    );
    expect(photos.upload).not.toHaveBeenCalled();
  });

  it('добавляет ключ и ссылку парой', async () => {
    const { prisma, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue(placeRow());
    prisma.travelMapPlace.update.mockResolvedValue(placeRow());
    await service.addPhoto(author, 'p1', file);
    expect(prisma.travelMapPlace.update.mock.calls[0][0].data).toEqual({
      photoKeys: { push: 'k1' },
      photoUrls: { push: 'u1' },
    });
  });

  it('удаление по индексу держит массивы парными', async () => {
    const { prisma, photos, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue(
      placeRow({ photoKeys: ['a', 'b'], photoUrls: ['ua', 'ub'] }),
    );
    prisma.travelMapPlace.update.mockResolvedValue(placeRow());
    await service.removePhoto(author, 'p1', 0);
    expect(prisma.travelMapPlace.update.mock.calls[0][0].data).toEqual({
      photoKeys: ['b'],
      photoUrls: ['ub'],
    });
    expect(photos.remove).toHaveBeenCalledWith('a');
    await expect(service.removePhoto(author, 'p1', 5)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('TravelMapService.reportPlace', () => {
  it('создаёт жалобу, повторная открытая — молча ок', async () => {
    const { prisma, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.travelMapPlaceReport.findFirst.mockResolvedValueOnce(null);
    await service.reportPlace(stranger, 'p1', { reason: 'закрылось давно' });
    expect(prisma.travelMapPlaceReport.create).toHaveBeenCalledTimes(1);

    prisma.travelMapPlaceReport.findFirst.mockResolvedValueOnce({ id: 'r1' });
    await service.reportPlace(stranger, 'p1', { reason: 'закрылось давно' });
    expect(prisma.travelMapPlaceReport.create).toHaveBeenCalledTimes(1);
  });

  it('короткая причина — 400', async () => {
    const { service } = setup();
    await expect(
      service.reportPlace(stranger, 'p1', { reason: 'ой' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('TravelMapService: админка', () => {
  it('не-админ получает 403 везде', async () => {
    const { service } = setup();
    await expect(service.adminListPlaces(author, {})).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.adminVerify(author, 'p1')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.adminListReports(author, {})).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.adminResolveReport(author, 'r1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('verify ставит отметку и автора отметки, hide — статус и причину', async () => {
    const { prisma, service } = setup();
    prisma.travelMapPlace.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.travelMapPlace.update.mockResolvedValue(placeRow());
    await service.adminVerify(admin, 'p1');
    expect(prisma.travelMapPlace.update.mock.calls[0][0].data).toMatchObject({
      verifiedById: 'a1',
    });
    await service.adminHide(admin, 'p1', { reason: 'дубль' });
    expect(prisma.travelMapPlace.update.mock.calls[1][0].data).toEqual({
      status: 'hidden',
      hiddenReason: 'дубль',
    });
  });

  it('список жалоб несёт название места и имя заявителя', async () => {
    const { prisma, service } = setup();
    prisma.travelMapPlaceReport.findMany.mockResolvedValue([
      {
        id: 'r1',
        placeId: 'p1',
        place: { name: 'Храм' },
        reason: 'закрылось',
        status: 'open',
        reporter: {
          id: 'u2',
          name: 'Пётр',
          spiritualName: 'Пита дас',
          isAgent: false,
        },
        createdAt: new Date('2026-01-01'),
      },
    ]);
    const [report] = await service.adminListReports(admin, {});
    expect(report.placeName).toBe('Храм');
    expect(report.reporter?.id).toBe('u2');
    expect(prisma.travelMapPlaceReport.findMany.mock.calls[0][0].where).toEqual(
      {
        status: 'open',
      },
    );
  });
});
