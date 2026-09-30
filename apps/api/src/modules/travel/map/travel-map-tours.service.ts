import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import {
  resolveDisplayName,
  type AccessTokenPayload,
  type TravelMapAuthorDto,
  type TravelMapGroupRequestedEvent,
  type TravelMapGroupResponse,
  type TravelMapTourDto,
  type TravelMapTourMembershipEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { isAdmin } from '../is-admin';
import {
  parseCreateTourInput,
  parseUpdateTourInput,
  type UpdateTourFields,
} from './tour-input';

const TOURS_LIMIT = 200;
const CITY_MAX = 100;

const userSelect = {
  id: true,
  name: true,
  spiritualName: true,
  isAgent: true,
} as const;

const tourInclude = {
  guide: { select: userSelect },
  route: { select: { id: true, kind: true, startLat: true, startLng: true } },
} as const;
type TourRow = Prisma.TravelMapTourGetPayload<{ include: typeof tourInclude }>;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function authorOf(user: UserRow): TravelMapAuthorDto {
  return { id: user.id, name: resolveDisplayName(user), isAgent: user.isAgent };
}

function str(raw: Record<string, unknown> | undefined, key: string) {
  const v = raw?.[key];
  return typeof v === 'string' ? v.trim() : '';
}

@Injectable()
export class TravelMapToursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  private canManage(viewer: AccessTokenPayload, guideId: string): boolean {
    return guideId === viewer.sub || isAdmin(viewer);
  }

  private toDto(
    row: TourRow,
    extra: {
      joined: boolean;
      canManage: boolean;
      participants: TravelMapTourDto['participants'];
    },
  ): TravelMapTourDto {
    return {
      id: row.id,
      title: row.title,
      routeId: row.routeId,
      routeName: row.routeName,
      routeKind: row.route?.kind ?? null,
      city: row.city,
      guide: authorOf(row.guide),
      startsAt: row.startsAt.toISOString(),
      timezone: row.timezone,
      meetingPoint: row.meetingPoint,
      capacity: row.capacity,
      payment: row.payment,
      priceMinor: row.priceMinor,
      currency: row.currency,
      note: row.note,
      status: row.status,
      participantsCount: row.participantsCount,
      joined: extra.joined,
      canManage: extra.canManage,
      chatConversationId: row.chatConversationId,
      participants: extra.participants,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async load(id: string): Promise<TourRow> {
    const row = await this.prisma.travelMapTour.findUnique({
      where: { id },
      include: tourInclude,
    });
    if (!row) throw new NotFoundException('Экскурсия не найдена');
    return row;
  }

  /** Тот, кто правит набор: гид или админ. Постороннему — 403, а не 404: набор публичный. */
  private async loadManaged(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TourRow> {
    const row = await this.load(id);
    if (!this.canManage(viewer, row.guideId)) {
      throw new ForbiddenException('Набором управляет только экскурсовод');
    }
    return row;
  }

  async list(
    viewer: AccessTokenPayload,
    query: Record<string, unknown>,
  ): Promise<TravelMapTourDto[]> {
    const where: Prisma.TravelMapTourWhereInput = {};
    // По умолчанию — только живые предстоящие наборы; `upcoming=0` — вся история.
    if (str(query, 'upcoming') !== '0') {
      where.status = 'scheduled';
      where.startsAt = { gte: new Date() };
    }
    const routeId = str(query, 'routeId');
    if (routeId) where.routeId = routeId;
    const guideId = str(query, 'guideId');
    if (guideId) where.guideId = guideId;
    const city = str(query, 'city').slice(0, CITY_MAX);
    if (city) where.city = { contains: city, mode: 'insensitive' };

    const rows = await this.prisma.travelMapTour.findMany({
      where,
      include: tourInclude,
      orderBy: { startsAt: 'asc' },
      take: TOURS_LIMIT,
    });
    if (rows.length === 0) return [];
    const mine = await this.prisma.travelMapTourParticipant.findMany({
      where: { userId: viewer.sub, tourId: { in: rows.map((r) => r.id) } },
      select: { tourId: true },
    });
    const joinedIds = new Set(mine.map((m) => m.tourId));
    return rows.map((row) =>
      this.toDto(row, {
        joined: joinedIds.has(row.id),
        canManage: this.canManage(viewer, row.guideId),
        participants: [],
      }),
    );
  }

  async get(viewer: AccessTokenPayload, id: string): Promise<TravelMapTourDto> {
    const row = await this.load(id);
    const canManage = this.canManage(viewer, row.guideId);
    const mine = await this.prisma.travelMapTourParticipant.findUnique({
      where: { tourId_userId: { tourId: id, userId: viewer.sub } },
      select: { id: true },
    });
    let participants: TravelMapTourDto['participants'] = [];
    // Список записавшихся — личные данные людей: видит только тот, кто ведёт.
    if (canManage) {
      const people = await this.prisma.travelMapTourParticipant.findMany({
        where: { tourId: id },
        include: { user: { select: userSelect } },
        orderBy: { createdAt: 'asc' },
      });
      participants = people.map((p) => ({
        userId: p.userId,
        name: resolveDisplayName(p.user),
        isAgent: p.user.isAgent,
        joinedAt: p.createdAt.toISOString(),
      }));
    }
    return this.toDto(row, { joined: !!mine, canManage, participants });
  }

  async create(
    viewer: AccessTokenPayload,
    body: unknown,
  ): Promise<TravelMapTourDto> {
    const input = parseCreateTourInput(body);
    const guide = await this.prisma.travelMapGuide.findUnique({
      where: { userId: viewer.sub },
      select: { id: true },
    });
    if (!guide) {
      throw new ForbiddenException('Сначала заполните профиль экскурсовода');
    }
    const route = await this.prisma.travelMapRoute.findUnique({
      where: { id: input.routeId },
      select: { id: true, name: true, city: true, status: true },
    });
    if (!route || route.status !== 'active') {
      throw new NotFoundException('Маршрут не найден');
    }
    const created = await this.prisma.travelMapTour.create({
      data: {
        // Название и город копируем: маршрут могут удалить, набор останется.
        title: input.title || route.name,
        routeId: route.id,
        routeName: route.name,
        city: route.city,
        guideId: viewer.sub,
        startsAt: input.startsAt,
        timezone: input.timezone,
        meetingPoint: input.meetingPoint,
        capacity: input.capacity,
        payment: input.payment,
        priceMinor: input.priceMinor,
        currency: input.currency,
        note: input.note,
      },
      select: { id: true },
    });
    return this.get(viewer, created.id);
  }

  async update(
    viewer: AccessTokenPayload,
    id: string,
    body: unknown,
  ): Promise<TravelMapTourDto> {
    const input = parseUpdateTourInput(body);
    const row = await this.loadManaged(viewer, id);
    if (row.status !== 'scheduled') {
      throw new BadRequestException(
        'Завершённую или отменённую экскурсию не правят',
      );
    }
    const data: UpdateTourFields = { ...input };
    // Цену без «за плату» не держим, даже если оплату в этой правке не меняли.
    if ((data.payment ?? row.payment) !== 'paid') data.priceMinor = null;
    if (data.title === '') data.title = row.routeName;
    if (data.capacity != null && data.capacity < row.participantsCount) {
      throw new BadRequestException('Мест меньше, чем уже записалось');
    }
    await this.prisma.travelMapTour.update({ where: { id }, data });
    return this.get(viewer, id);
  }

  async cancel(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapTourDto> {
    const row = await this.loadManaged(viewer, id);
    if (row.status !== 'scheduled') {
      throw new BadRequestException('Экскурсия уже закрыта');
    }
    await this.prisma.travelMapTour.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    return this.get(viewer, id);
  }

  async complete(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapTourDto> {
    const row = await this.loadManaged(viewer, id);
    if (row.status !== 'scheduled') {
      throw new BadRequestException('Экскурсия уже закрыта');
    }
    // Отметить «прошла» заранее нельзя: иначе счётчик гида накрутить одним кликом.
    if (row.startsAt.getTime() > Date.now()) {
      throw new BadRequestException('Экскурсия ещё не началась');
    }
    await this.prisma.travelMapTour.update({
      where: { id },
      data: { status: 'done' },
    });
    return this.get(viewer, id);
  }

  private emitMembership(
    row: { chatConversationId: string | null; guideId: string },
    userId: string,
    action: TravelMapTourMembershipEvent['action'],
  ): void {
    // Пока группы нет, чату некого добавлять: участников подтянет openGroup.
    if (!row.chatConversationId) return;
    const event: TravelMapTourMembershipEvent = {
      conversationId: row.chatConversationId,
      guideId: row.guideId,
      userId,
      action,
    };
    this.events.emit('travel.map.tour.membership', event);
  }

  async join(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapTourDto> {
    const row = await this.load(id);
    if (row.status !== 'scheduled') {
      throw new BadRequestException('Набор закрыт');
    }
    if (row.startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('Экскурсия уже началась');
    }
    if (row.guideId === viewer.sub) {
      throw new BadRequestException('Вы ведёте эту экскурсию');
    }

    const added = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.travelMapTourParticipant.findUnique({
        where: { tourId_userId: { tourId: id, userId: viewer.sub } },
        select: { id: true },
      });
      // Повторная запись — не ошибка: двойной клик не должен пугать человека.
      if (existing) return false;
      const fresh = await tx.travelMapTour.findUnique({
        where: { id },
        select: { capacity: true, participantsCount: true },
      });
      if (
        fresh?.capacity != null &&
        fresh.participantsCount >= fresh.capacity
      ) {
        throw new BadRequestException('Мест нет');
      }
      await tx.travelMapTourParticipant.create({
        data: { tourId: id, userId: viewer.sub },
      });
      await tx.travelMapTour.update({
        where: { id },
        data: { participantsCount: { increment: 1 } },
      });
      return true;
    });

    if (added) this.emitMembership(row, viewer.sub, 'joined');
    return this.get(viewer, id);
  }

  async leave(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapTourDto> {
    const row = await this.load(id);
    const removed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.travelMapTourParticipant.deleteMany({
        where: { tourId: id, userId: viewer.sub },
      });
      if (count === 0) return false;
      await tx.travelMapTour.update({
        where: { id },
        data: { participantsCount: { decrement: 1 } },
      });
      return true;
    });
    if (removed) this.emitMembership(row, viewer.sub, 'left');
    return this.get(viewer, id);
  }

  async openGroup(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapGroupResponse> {
    const row = await this.loadManaged(viewer, id);
    if (row.chatConversationId) {
      return { conversationId: row.chatConversationId };
    }
    // Создателем группы выступает гид, даже если кнопку нажал админ: группа
    // должна принадлежать тому, кто ведёт.
    const event: TravelMapGroupRequestedEvent = {
      requesterId: row.guideId,
      kind: 'tour',
      placeId: row.id,
      title: row.title,
      kindLabel: 'Экскурсия',
      lat: row.route?.startLat ?? 0,
      lng: row.route?.startLng ?? 0,
      city: row.city,
    };
    const results: unknown[] = await this.events.emitAsync(
      'travel.map.group.requested',
      event,
    );
    const conversationId =
      results.find((value): value is string => typeof value === 'string') ??
      null;
    if (!conversationId) {
      throw new BadRequestException(
        'Не удалось открыть группу: «Общение» не ответило',
      );
    }
    // Два нажатия одновременно: сохранится id только от первого.
    await this.prisma.travelMapTour.updateMany({
      where: { id, chatConversationId: null },
      data: { chatConversationId: conversationId },
    });
    // Записавшиеся до создания группы в неё сами не попадут — добавляем их.
    const people = await this.prisma.travelMapTourParticipant.findMany({
      where: { tourId: id },
      select: { userId: true },
    });
    for (const person of people) {
      this.emitMembership(
        { chatConversationId: conversationId, guideId: row.guideId },
        person.userId,
        'joined',
      );
    }
    return { conversationId };
  }

  /** Чат привязал беседу к набору (`chat.conversation.context-linked`). */
  async linkConversation(
    tourId: string,
    conversationId: string,
  ): Promise<void> {
    const tour = await this.prisma.travelMapTour.findUnique({
      where: { id: tourId },
      select: { id: true },
    });
    // Событие общее для сервисов и для мест «Карты»: чужой id — не наш набор.
    if (!tour) return;
    await this.prisma.travelMapTour.updateMany({
      where: { id: tourId, chatConversationId: null },
      data: { chatConversationId: conversationId },
    });
  }
}
