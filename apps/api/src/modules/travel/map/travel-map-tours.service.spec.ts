/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- вызовы jest.fn() типизируются как any */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AccessTokenPayload } from '@vedamatch/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import { TravelMapToursService } from './travel-map-tours.service';

const guide = { sub: 'g1' } as AccessTokenPayload;
const guest = { sub: 'u2' } as AccessTokenPayload;

const future = () => new Date(Date.now() + 86_400_000);

function tourRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    title: 'Парикрама',
    routeId: 'r1',
    routeName: 'Парикрама',
    city: 'Вриндаван',
    guideId: 'g1',
    guide: { id: 'g1', name: 'Гид', spiritualName: null, isAgent: false },
    route: { id: 'r1', kind: 'parikrama', startLat: 27.5, startLng: 77.7 },
    startsAt: future(),
    timezone: null,
    meetingPoint: 'У храма',
    capacity: null,
    payment: 'free',
    priceMinor: null,
    currency: 'rub',
    note: '',
    status: 'scheduled',
    participantsCount: 0,
    chatConversationId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

function setup() {
  const prisma: Record<string, any> = {
    travelMapGuide: { findUnique: jest.fn().mockResolvedValue({ id: 'gp' }) },
    travelMapRoute: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'r1',
        name: 'Парикрама',
        city: 'Вриндаван',
        status: 'active',
      }),
    },
    travelMapTour: {
      findUnique: jest.fn().mockResolvedValue(tourRow()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 't1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    travelMapTourParticipant: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  const events = {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue(['c1']),
  };
  return {
    prisma,
    events,
    service: new TravelMapToursService(
      prisma as unknown as PrismaService,
      events as unknown as EventEmitter2,
    ),
  };
}

const createBody = (over: Record<string, unknown> = {}) => ({
  routeId: 'r1',
  startsAt: future().toISOString(),
  meetingPoint: 'У храма',
  payment: 'free',
  ...over,
});

describe('TravelMapToursService', () => {
  describe('create', () => {
    it('гид без профиля — 403', async () => {
      const { prisma, service } = setup();
      prisma.travelMapGuide.findUnique.mockResolvedValue(null);
      await expect(service.create(guide, createBody())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('дата в прошлом — 400', async () => {
      const { service } = setup();
      await expect(
        service.create(
          guide,
          createBody({ startsAt: new Date(Date.now() - 1000).toISOString() }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('скрытый маршрут — 404', async () => {
      const { prisma, service } = setup();
      prisma.travelMapRoute.findUnique.mockResolvedValue({
        id: 'r1',
        name: 'x',
        city: null,
        status: 'hidden',
      });
      await expect(service.create(guide, createBody())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('название по умолчанию — из маршрута, снимок города', async () => {
      const { prisma, service } = setup();
      await service.create(guide, createBody());
      expect(prisma.travelMapTour.create.mock.calls[0][0].data).toMatchObject({
        title: 'Парикрама',
        routeName: 'Парикрама',
        city: 'Вриндаван',
        guideId: 'g1',
      });
    });
  });

  describe('join', () => {
    it('гид сам не записывается — 400', async () => {
      const { service } = setup();
      await expect(service.join(guide, 't1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('мест нет — 400', async () => {
      const { prisma, service } = setup();
      prisma.travelMapTour.findUnique.mockResolvedValue(
        tourRow({ capacity: 2, participantsCount: 2 }),
      );
      await expect(service.join(guest, 't1')).rejects.toThrow('Мест нет');
    });

    it('эмитит membership, когда группа есть', async () => {
      const { prisma, events, service } = setup();
      prisma.travelMapTour.findUnique.mockResolvedValue(
        tourRow({ chatConversationId: 'c1' }),
      );
      await service.join(guest, 't1');
      expect(prisma.travelMapTour.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { participantsCount: { increment: 1 } },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('travel.map.tour.membership', {
        conversationId: 'c1',
        guideId: 'g1',
        userId: 'u2',
        action: 'joined',
      });
    });

    it('не эмитит без группы', async () => {
      const { events, service } = setup();
      await service.join(guest, 't1');
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('повторная запись молча ок и без события', async () => {
      const { prisma, events, service } = setup();
      prisma.travelMapTour.findUnique.mockResolvedValue(
        tourRow({ chatConversationId: 'c1' }),
      );
      prisma.travelMapTourParticipant.findUnique.mockResolvedValue({ id: 'p' });
      await service.join(guest, 't1');
      expect(prisma.travelMapTourParticipant.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('уменьшает счётчик и эмитит left', async () => {
      const { prisma, events, service } = setup();
      prisma.travelMapTour.findUnique.mockResolvedValue(
        tourRow({ chatConversationId: 'c1', participantsCount: 1 }),
      );
      await service.leave(guest, 't1');
      expect(prisma.travelMapTour.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { participantsCount: { decrement: 1 } },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'travel.map.tour.membership',
        expect.objectContaining({ action: 'left', userId: 'u2' }),
      );
    });
  });

  describe('get', () => {
    it('участники пусты для постороннего', async () => {
      const { prisma, service } = setup();
      const dto = await service.get(guest, 't1');
      expect(dto.participants).toEqual([]);
      expect(dto.canManage).toBe(false);
      expect(prisma.travelMapTourParticipant.findMany).not.toHaveBeenCalled();
    });

    it('гид видит участников', async () => {
      const { prisma, service } = setup();
      prisma.travelMapTourParticipant.findMany.mockResolvedValue([
        {
          userId: 'u2',
          createdAt: new Date('2026-02-01'),
          user: { id: 'u2', name: 'Пётр', spiritualName: null, isAgent: false },
        },
      ]);
      const dto = await service.get(guide, 't1');
      expect(dto.canManage).toBe(true);
      expect(dto.participants).toHaveLength(1);
    });
  });

  describe('complete / update / cancel', () => {
    it('complete до начала — 400', async () => {
      const { service } = setup();
      await expect(service.complete(guide, 't1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('complete после начала ставит done', async () => {
      const { prisma, service } = setup();
      prisma.travelMapTour.findUnique.mockResolvedValue(
        tourRow({ startsAt: new Date(Date.now() - 1000) }),
      );
      await service.complete(guide, 't1');
      expect(prisma.travelMapTour.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { status: 'done' },
      });
    });

    it('посторонний не правит — 403', async () => {
      const { service } = setup();
      await expect(service.cancel(guest, 't1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('после cancelled правка — 400', async () => {
      const { prisma, service } = setup();
      prisma.travelMapTour.findUnique.mockResolvedValue(
        tourRow({ status: 'cancelled' }),
      );
      await expect(
        service.update(guide, 't1', { note: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('openGroup', () => {
    it('возвращает существующую группу без события', async () => {
      const { prisma, events, service } = setup();
      prisma.travelMapTour.findUnique.mockResolvedValue(
        tourRow({ chatConversationId: 'c9' }),
      );
      expect(await service.openGroup(guide, 't1')).toEqual({
        conversationId: 'c9',
      });
      expect(events.emitAsync).not.toHaveBeenCalled();
    });

    it('создаёт группу и рассылает membership по участникам', async () => {
      const { prisma, events, service } = setup();
      prisma.travelMapTourParticipant.findMany.mockResolvedValue([
        { userId: 'u2' },
        { userId: 'u3' },
      ]);
      const out = await service.openGroup(guide, 't1');
      expect(out).toEqual({ conversationId: 'c1' });
      expect(events.emitAsync).toHaveBeenCalledWith(
        'travel.map.group.requested',
        expect.objectContaining({
          requesterId: 'g1',
          kind: 'tour',
          placeId: 't1',
          lat: 27.5,
        }),
      );
      expect(prisma.travelMapTour.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', chatConversationId: null },
        data: { chatConversationId: 'c1' },
      });
      expect(events.emit).toHaveBeenCalledTimes(2);
    });

    it('чужому — 403', async () => {
      const { service } = setup();
      await expect(service.openGroup(guest, 't1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('linkConversation', () => {
    it('чужой id (место) игнорирует', async () => {
      const { prisma, service } = setup();
      prisma.travelMapTour.findUnique.mockResolvedValue(null);
      await service.linkConversation('p1', 'c1');
      expect(prisma.travelMapTour.updateMany).not.toHaveBeenCalled();
    });
  });
});
