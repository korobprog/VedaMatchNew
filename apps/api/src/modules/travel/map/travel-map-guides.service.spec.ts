/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- вызовы jest.fn() типизируются как any */
import { NotFoundException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import { TravelMapGuidesService } from './travel-map-guides.service';

const viewer = { sub: 'g1' } as AccessTokenPayload;

function guideRow(over: Record<string, unknown> = {}) {
  return {
    id: 'gp1',
    userId: 'g1',
    user: { id: 'g1', name: 'Иван', spiritualName: null, isAgent: false },
    about: 'Вожу',
    languages: ['ru'],
    cities: ['Москва'],
    telegram: null,
    phone: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

function setup() {
  const prisma: Record<string, any> = {
    travelMapGuide: {
      findMany: jest.fn().mockResolvedValue([guideRow()]),
      findUnique: jest.fn().mockResolvedValue(guideRow()),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    travelMapTour: {
      groupBy: jest.fn().mockResolvedValue([
        { guideId: 'g1', status: 'done', _count: { _all: 3 } },
        { guideId: 'g1', status: 'scheduled', _count: { _all: 2 } },
      ]),
    },
  };
  return {
    prisma,
    service: new TravelMapGuidesService(prisma as unknown as PrismaService),
  };
}

describe('TravelMapGuidesService', () => {
  it('list считает наборы одним groupBy', async () => {
    const { prisma, service } = setup();
    const out = await service.list();
    expect(prisma.travelMapTour.groupBy).toHaveBeenCalledTimes(1);
    expect(out[0]).toMatchObject({
      toursDone: 3,
      toursUpcoming: 2,
      name: 'Иван',
    });
  });

  it('get без профиля — 404', async () => {
    const { prisma, service } = setup();
    prisma.travelMapGuide.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('me без профиля — null', async () => {
    const { prisma, service } = setup();
    prisma.travelMapGuide.findUnique.mockResolvedValue(null);
    expect(await service.me(viewer)).toBeNull();
  });

  it('upsertMe пишет разобранные поля', async () => {
    const { prisma, service } = setup();
    await service.upsertMe(viewer, { about: ' hi ', languages: ['ru', 'ru'] });
    expect(prisma.travelMapGuide.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'g1' },
        update: expect.objectContaining({ about: 'hi', languages: ['ru'] }),
      }),
    );
  });

  it('removeMe удаляет профиль', async () => {
    const { prisma, service } = setup();
    await service.removeMe(viewer);
    expect(prisma.travelMapGuide.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'g1' },
    });
  });
});
