import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TravelBookingStatus } from '@prisma/client';
import type { TravelBookingDto, TravelStayCardDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { generatePublicCode } from './public-code';
import { parseStayInput, TravelInputError } from './travel-dto';
import {
  notifiesGuest,
  TRAVEL_BOOKING_DECIDED_EVENT,
  TRAVEL_EVENTS,
} from './travel-events';
import {
  bookingInclude,
  stayCardSelect,
  toBookingDto,
  toStayCard,
} from './travel.service';

/**
 * Куда можно перевести заявку из текущего состояния.
 *
 * Таблицей, а не набором `if`: путь заявки — правило продукта, и читаться оно
 * должно в одном месте. Отклонённая и отменённая — тупики: чтобы передумать,
 * заводят новую заявку, иначе история решений теряется.
 */
export const MANAGER_TRANSITIONS: Record<
  TravelBookingStatus,
  readonly TravelBookingStatus[]
> = {
  new_request: ['accepted', 'declined'],
  accepted: ['checked_in', 'declined'],
  checked_in: ['completed'],
  completed: [],
  declined: [],
  cancelled: [],
};

/**
 * Значение поля формы как строка. `String(unknown)` здесь не годится: на
 * объекте он даёт «[object Object]», и такая «комната» уехала бы в базу.
 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function canManagerMove(
  from: TravelBookingStatus,
  to: TravelBookingStatus,
): boolean {
  return MANAGER_TRANSITIONS[from].includes(to);
}

@Injectable()
export class TravelManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Объекты, которыми человек управляет, — включая черновики. */
  async myStays(userId: string): Promise<{ items: TravelStayCardDto[] }> {
    const rows = await this.prisma.travelStay.findMany({
      where: { managers: { some: { userId } } },
      select: stayCardSelect,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toStayCard) };
  }

  async createStay(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<TravelStayCardDto> {
    const input = this.parse(body);
    const row = await this.prisma.travelStay.create({
      data: {
        ...input,
        publicCode: await this.freePublicCode(),
        // Заводится черновиком: карточка без фотографий и комнат в общем
        // списке никому не помогает, публикует её хозяин отдельной кнопкой.
        status: 'draft',
        managers: { create: { userId, role: 'owner' } },
      },
      select: stayCardSelect,
    });
    return toStayCard(row);
  }

  async updateStay(
    userId: string,
    stayId: string,
    body: Record<string, unknown>,
  ): Promise<TravelStayCardDto> {
    await this.assertManager(userId, stayId);
    const row = await this.prisma.travelStay.update({
      where: { id: stayId },
      data: this.parse(body),
      select: stayCardSelect,
    });
    return toStayCard(row);
  }

  /** Публикация и снятие с публикации. Удаление объекта — только у админа. */
  async setStayStatus(
    userId: string,
    stayId: string,
    status: 'published' | 'hidden_by_author' | 'draft',
  ): Promise<TravelStayCardDto> {
    const stay = await this.assertManager(userId, stayId);
    if (stay.status === 'removed_by_admin') {
      throw new ForbiddenException(
        'Объект снят администрацией — вернуть его может только она',
      );
    }
    const row = await this.prisma.travelStay.update({
      where: { id: stayId },
      data: { status },
      select: stayCardSelect,
    });
    return toStayCard(row);
  }

  async addRoom(
    userId: string,
    stayId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string }> {
    await this.assertManager(userId, stayId);

    const number = asText(body.number);
    if (!number) throw new BadRequestException('У комнаты должен быть номер');
    const building = asText(body.building);

    const capacity = Number(body.capacity ?? 1);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 60) {
      throw new BadRequestException('Мест в комнате должно быть от 1 до 60');
    }

    const priceMinor =
      body.priceMinor === undefined || body.priceMinor === null
        ? null
        : Number(body.priceMinor);
    if (
      priceMinor !== null &&
      (!Number.isInteger(priceMinor) || priceMinor < 0)
    ) {
      throw new BadRequestException(
        'Цена комнаты должна быть целой и неотрицательной',
      );
    }

    const existing = await this.prisma.travelRoom.findFirst({
      where: { stayId, building, number },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Такая комната у объекта уже заведена');
    }

    return this.prisma.travelRoom.create({
      data: { stayId, building, number, capacity, priceMinor },
      select: { id: true },
    });
  }

  async removeRoom(
    userId: string,
    stayId: string,
    roomId: string,
  ): Promise<void> {
    await this.assertManager(userId, stayId);
    const room = await this.prisma.travelRoom.findFirst({
      where: { id: roomId, stayId },
      select: { id: true },
    });
    if (!room) throw new NotFoundException('Комната не найдена');
    // Заявки останутся с roomId = null (SetNull в схеме): уборка комнат у
    // хозяина не должна стирать историю заездов.
    await this.prisma.travelRoom.delete({ where: { id: roomId } });
  }

  /** Входящие заявки объекта. */
  async bookings(
    userId: string,
    stayId: string,
  ): Promise<{ items: TravelBookingDto[] }> {
    await this.assertManager(userId, stayId);
    const rows = await this.prisma.travelBooking.findMany({
      where: { stayId },
      include: bookingInclude,
      orderBy: [{ status: 'asc' }, { checkIn: 'asc' }],
      take: 200,
    });
    return { items: rows.map(toBookingDto) };
  }

  async decide(
    userId: string,
    bookingId: string,
    status: TravelBookingStatus,
    reason: string | null,
  ): Promise<TravelBookingDto> {
    const booking = await this.prisma.travelBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, stayId: true, status: true },
    });
    if (!booking) throw new NotFoundException('Заявка не найдена');
    await this.assertManager(userId, booking.stayId);

    if (!canManagerMove(booking.status, status)) {
      throw new BadRequestException(
        `Из состояния «${booking.status}» в «${status}» заявку не переводят`,
      );
    }
    if (status === 'declined' && !reason) {
      throw new BadRequestException(
        'Напишите причину отказа — гостю нужно понять, искать ли другое место',
      );
    }

    const updated = await this.prisma.travelBooking.update({
      where: { id: bookingId },
      data: {
        status,
        declineReason: status === 'declined' ? reason : null,
        decidedAt: new Date(),
      },
      include: bookingInclude,
    });

    // Зеркалам в других сервисах — всегда: карточка в «Моём дне» обязана
    // поменяться и у заявки, гость которой не человек портала.
    this.events.emit(TRAVEL_BOOKING_DECIDED_EVENT, {
      bookingId: updated.id,
      status: updated.status,
    });

    // Уведомление — только когда есть кому его читать.
    if (updated.guestUserId && notifiesGuest(updated.status)) {
      this.events.emit(TRAVEL_EVENTS.bookingStatusChanged, {
        name: TRAVEL_EVENTS.bookingStatusChanged,
        recipientId: updated.guestUserId,
        bookingId: updated.id,
        bookingNumber: updated.number,
        stayId: updated.stayId,
        stayName: updated.stay.name,
        status: updated.status,
        reason: updated.declineReason,
      });
    }

    return toBookingDto(updated);
  }

  private parse(body: Record<string, unknown>) {
    try {
      return parseStayInput(body);
    } catch (error) {
      if (error instanceof TravelInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async assertManager(userId: string, stayId: string) {
    const stay = await this.prisma.travelStay.findFirst({
      where: { id: stayId, managers: { some: { userId } } },
      select: { id: true, status: true },
    });
    if (!stay) throw new NotFoundException('Объект не найден');
    return stay;
  }

  /**
   * Свободный публичный код. Коллизия на ~10^9 вариантов почти невероятна, но
   * `publicCode` уникален в базе, и вставка с занятым кодом упала бы у хозяина
   * на глазах. Пять попыток — с запасом.
   */
  private async freePublicCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generatePublicCode();
      const taken = await this.prisma.travelStay.findUnique({
        where: { publicCode: code },
        select: { id: true },
      });
      if (!taken) return code;
    }
    throw new BadRequestException(
      'Не удалось выдать код объекту — попробуйте ещё раз',
    );
  }
}
