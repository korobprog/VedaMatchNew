import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma, TravelBooking } from '@prisma/client';
import {
  TRAVEL_STAY_KIND_LABELS,
  type ContactTravelStayResponse,
  type TravelContactRequestedEvent,
} from '@vedamatch/shared';
import type {
  TravelBookingDto,
  TravelPlaceDto,
  TravelStayCardDto,
  TravelStayDto,
  TravelStayKind,
  TravelStayPayment,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { countNights, formatStayDate, rangesOverlap } from './travel-dates';
import {
  calcTotalMinor,
  parseBookingInput,
  TravelInputError,
  type ParsedBookingInput,
} from './travel-dto';
import {
  contactCardBody,
  contactMessage,
  pickStayRecipient,
} from './travel-contact';
import {
  bookingRecipients,
  TRAVEL_CONTACT_REQUESTED_EVENT,
  TRAVEL_EVENTS,
} from './travel-events';

/** Комнату показываем как «корпус, номер» — без корпуса просто номером. */
export function roomLabel(
  room: { building: string; number: string } | null,
): string | null {
  if (!room) return null;
  return room.building ? `${room.building}, ${room.number}` : room.number;
}

export const stayCardSelect = {
  id: true,
  kind: true,
  name: true,
  address: true,
  lat: true,
  lng: true,
  payment: true,
  priceMinor: true,
  currency: true,
  photoUrls: true,
  publicCode: true,
  place: { select: { name: true } },
} satisfies Prisma.TravelStaySelect;

type StayCardRow = Prisma.TravelStayGetPayload<{
  select: typeof stayCardSelect;
}>;

export function toStayCard(row: StayCardRow): TravelStayCardDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    placeName: row.place?.name ?? null,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    payment: row.payment,
    priceMinor: row.priceMinor,
    currency: row.currency,
    photoUrl: row.photoUrls[0] ?? null,
    publicCode: row.publicCode,
  };
}

export const bookingInclude = {
  stay: { select: { name: true } },
  room: { select: { building: true, number: true } },
} satisfies Prisma.TravelBookingInclude;

type BookingRow = TravelBooking & {
  stay: { name: string };
  room: { building: string; number: string } | null;
};

export function toBookingDto(row: BookingRow): TravelBookingDto {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    stayId: row.stayId,
    stayName: row.stay.name,
    roomLabel: roomLabel(row.room),
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    checkIn: formatStayDate(row.checkIn),
    checkOut: formatStayDate(row.checkOut),
    nights: countNights(row.checkIn, row.checkOut),
    guests: row.guests,
    comment: row.comment,
    declineReason: row.declineReason,
    totalMinor: row.totalMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class TravelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Точки на карте и число опубликованных объектов в каждой. */
  async places(): Promise<{ items: TravelPlaceDto[] }> {
    const rows = await this.prisma.travelPlace.findMany({
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { stays: { where: { status: 'published' } } } },
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        country: row.country,
        region: row.region,
        lat: row.lat,
        lng: row.lng,
        summary: row.summary,
        stayCount: row._count.stays,
      })),
    };
  }

  async stays(filters: {
    placeId?: string;
    kind?: TravelStayKind;
    payment?: TravelStayPayment;
  }): Promise<{ items: TravelStayCardDto[] }> {
    const where: Prisma.TravelStayWhereInput = { status: 'published' };
    if (filters.placeId) where.placeId = filters.placeId;
    if (filters.kind) where.kind = filters.kind;
    // «За плату» и «за служение» показывают и объекты, принимающие и так, и
    // так: фильтр отвечает на вопрос «мне это подойдёт?», а не «что написано
    // в поле».
    if (filters.payment === 'paid') where.payment = { in: ['paid', 'both'] };
    if (filters.payment === 'seva') where.payment = { in: ['seva', 'both'] };

    const rows = await this.prisma.travelStay.findMany({
      where,
      select: stayCardSelect,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { items: rows.map(toStayCard) };
  }

  /**
   * Карточка объекта. Черновик и снятое с публикации видит только тот, кто им
   * управляет: иначе ссылка из переписки открывала бы страницу, которую
   * хозяин со стены уже снял.
   */
  async stay(id: string, viewerId: string | null): Promise<TravelStayDto> {
    const row = await this.prisma.travelStay.findUnique({
      where: { id },
      select: {
        ...stayCardSelect,
        description: true,
        sevaNote: true,
        contactPhone: true,
        status: true,
        rooms: {
          select: {
            id: true,
            building: true,
            number: true,
            capacity: true,
            priceMinor: true,
          },
          orderBy: [{ building: 'asc' }, { number: 'asc' }],
        },
        managers: { select: { userId: true } },
      },
    });
    if (!row) throw new NotFoundException('Объект не найден');

    const manageable = Boolean(
      viewerId && row.managers.some((manager) => manager.userId === viewerId),
    );
    if (row.status !== 'published' && !manageable) {
      throw new NotFoundException('Объект не найден');
    }

    return {
      ...toStayCard(row),
      description: row.description,
      sevaNote: row.sevaNote,
      photoUrls: row.photoUrls,
      contactPhone: row.contactPhone,
      status: row.status,
      rooms: row.rooms,
      manageable,
    };
  }

  /** Заявки, поданные человеком. */
  async myBookings(userId: string): Promise<{ items: TravelBookingDto[] }> {
    const rows = await this.prisma.travelBooking.findMany({
      where: { guestUserId: userId },
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: rows.map(toBookingDto) };
  }

  async createBooking(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<TravelBookingDto> {
    let input: ParsedBookingInput;
    try {
      input = parseBookingInput(body, new Date());
    } catch (error) {
      if (error instanceof TravelInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const stay = await this.prisma.travelStay.findUnique({
      where: { id: input.stayId },
      select: {
        id: true,
        name: true,
        status: true,
        priceMinor: true,
        currency: true,
        managers: { select: { userId: true } },
        rooms: { select: { id: true, priceMinor: true, capacity: true } },
      },
    });
    if (!stay || stay.status !== 'published') {
      throw new NotFoundException('Объект не найден или снят с публикации');
    }

    const room = input.roomId
      ? (stay.rooms.find((candidate) => candidate.id === input.roomId) ?? null)
      : null;
    if (input.roomId && !room) {
      throw new NotFoundException('Такой комнаты у объекта нет');
    }
    if (room && input.guests > room.capacity) {
      throw new BadRequestException(
        `В комнате помещается ${room.capacity} — выберите другую или уменьшите число гостей`,
      );
    }
    if (room) await this.assertRoomFree(room.id, input);

    const booking = await this.prisma.travelBooking.create({
      data: {
        stayId: stay.id,
        roomId: room?.id ?? null,
        guestUserId: userId,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        comment: input.comment,
        totalMinor: calcTotalMinor(
          input.nights,
          stay.priceMinor,
          room?.priceMinor ?? null,
        ),
        currency: stay.currency,
      },
      include: bookingInclude,
    });

    this.announceCreated(
      booking,
      stay.name,
      stay.managers.map((manager) => manager.userId),
      userId,
    );
    return toBookingDto(booking);
  }

  /**
   * «Написать хозяину». Писать можно по опубликованному объекту либо по
   * своей заявке — хозяин снятого объекта остаётся на связи с теми, кто у
   * него уже бронировал. Переписку открывает «Общение» по событию.
   */
  async contactManager(
    userId: string,
    stayId: string,
    body: { bookingId?: unknown; message?: unknown },
  ): Promise<ContactTravelStayResponse> {
    const stay = await this.prisma.travelStay.findUnique({
      where: { id: stayId },
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        managers: { select: { userId: true, role: true } },
      },
    });
    if (!stay) throw new NotFoundException('Объект не найден');

    const bookingId =
      typeof body.bookingId === 'string' && body.bookingId.trim()
        ? body.bookingId.trim()
        : null;
    const booking = bookingId
      ? await this.prisma.travelBooking.findFirst({
          where: { id: bookingId, stayId, guestUserId: userId },
          select: { id: true, number: true, checkIn: true, checkOut: true },
        })
      : null;
    if (bookingId && !booking) throw new NotFoundException('Заявка не найдена');
    if (stay.status !== 'published' && !booking) {
      throw new NotFoundException('Объект не найден или снят с публикации');
    }

    const recipientId = pickStayRecipient(stay.managers, userId);
    if (!recipientId) {
      throw new BadRequestException('Это ваш объект — писать хозяину не нужно');
    }

    const event: TravelContactRequestedEvent = {
      requesterId: userId,
      recipientId,
      stayId: stay.id,
      stayName: stay.name,
      stayKindLabel: TRAVEL_STAY_KIND_LABELS[stay.kind],
      bookingId: booking?.id ?? null,
      cardBody: contactCardBody(booking),
      message: contactMessage(body.message),
    };
    const results: unknown[] = await this.events.emitAsync(
      TRAVEL_CONTACT_REQUESTED_EVENT,
      event,
    );
    const conversationId =
      results.find((value): value is string => typeof value === 'string') ??
      null;
    if (!conversationId) {
      throw new ForbiddenException(
        'Переписка с хозяином недоступна — позвоните по телефону из карточки',
      );
    }
    return { conversationId };
  }

  /** Отменить свою заявку. Уехавшего гостя отменять поздно. */
  async cancelBooking(userId: string, id: string): Promise<TravelBookingDto> {
    const booking = await this.prisma.travelBooking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking || booking.guestUserId !== userId) {
      throw new NotFoundException('Заявка не найдена');
    }
    if (booking.status === 'checked_in' || booking.status === 'completed') {
      throw new ForbiddenException(
        'Заявку по состоявшемуся заезду не отменяют',
      );
    }
    if (booking.status === 'cancelled') return toBookingDto(booking);

    const updated = await this.prisma.travelBooking.update({
      where: { id },
      data: { status: 'cancelled', decidedAt: new Date() },
      include: bookingInclude,
    });
    return toBookingDto(updated);
  }

  /**
   * Занята ли комната. Проверяются только живые заявки: отклонённая и
   * отменённая комнату не держат.
   *
   * Пересечения считаются в коде, а не запросом с диапазоном: заявок на одну
   * комнату десятки, а не тысячи, и правило «выезд в день чужого заезда — не
   * пересечение» живёт одной проверенной функцией, а не второй раз в SQL.
   */
  private async assertRoomFree(
    roomId: string,
    range: { checkIn: Date; checkOut: Date },
  ): Promise<void> {
    const busy = await this.prisma.travelBooking.findMany({
      where: {
        roomId,
        status: { in: ['new_request', 'accepted', 'checked_in'] },
        checkOut: { gt: range.checkIn },
      },
      select: { checkIn: true, checkOut: true },
    });
    if (busy.some((taken) => rangesOverlap(taken, range))) {
      throw new BadRequestException(
        'На эти даты комната уже занята — выберите другие или другую комнату',
      );
    }
  }

  private announceCreated(
    booking: TravelBooking,
    stayName: string,
    managerIds: string[],
    actorId: string | null,
  ): void {
    for (const recipientId of bookingRecipients(managerIds, actorId)) {
      this.events.emit(TRAVEL_EVENTS.bookingCreated, {
        name: TRAVEL_EVENTS.bookingCreated,
        recipientId,
        bookingId: booking.id,
        bookingNumber: booking.number,
        stayId: booking.stayId,
        stayName,
        guestName: booking.guestName,
        checkIn: formatStayDate(booking.checkIn),
        checkOut: formatStayDate(booking.checkOut),
        nights: countNights(booking.checkIn, booking.checkOut),
      });
    }
  }
}
