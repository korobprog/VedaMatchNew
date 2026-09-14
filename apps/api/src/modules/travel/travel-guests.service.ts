import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  TravelGuestColor,
  TravelGuestDto,
  TravelGuestsResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CashInputError } from './cash-input';
import { parseGuestInput } from './guest-input';
import { compareGuests, paidThrough, unpaidNights } from './guest-stay';
import {
  GUEST_PHOTO_MIME,
  MAX_GUEST_PHOTO_BYTES,
  TravelGuestPhotosService,
  type UploadedGuestPhoto,
} from './travel-guest-photos.service';
import { formatStayDate } from './travel-dates';

const guestSelect = {
  id: true,
  fullName: true,
  phone: true,
  photoKey: true,
  keyLabel: true,
  roomId: true,
  room: { select: { building: true, number: true } },
  personalInfo: true,
  color: true,
  checkInOn: true,
  leftOn: true,
} satisfies Prisma.TravelGuestSelect;

type GuestRow = Prisma.TravelGuestGetPayload<{ select: typeof guestSelect }>;

/** «Корпус 2 · 14» или просто «14», если корпус один. */
export function roomLabel(room: { building: string; number: string }): string {
  return room.building ? `${room.building} · ${room.number}` : room.number;
}

/**
 * Клиентская база объекта. Доступ — только управляющим объекта: здесь
 * телефоны, фото и заметки о людях.
 */
@Injectable()
export class TravelGuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: TravelGuestPhotosService,
  ) {}

  async list(userId: string, stayId: string): Promise<TravelGuestsResponse> {
    await this.assertManager(userId, stayId);
    const [rows, rooms] = await Promise.all([
      this.prisma.travelGuest.findMany({
        where: { stayId },
        select: guestSelect,
      }),
      this.prisma.travelRoom.findMany({
        where: { stayId },
        select: { id: true, building: true, number: true },
        orderBy: [{ building: 'asc' }, { number: 'asc' }],
      }),
    ]);
    const paid = await this.paidNightsByGuest(rows.map((row) => row.id));
    rows.sort(compareGuests);
    return {
      items: await Promise.all(
        rows.map((row) => this.toDto(row, paid.get(row.id) ?? 0)),
      ),
      rooms: rooms.map((room) => ({ id: room.id, label: roomLabel(room) })),
    };
  }

  async create(
    userId: string,
    stayId: string,
    body: Record<string, unknown>,
  ): Promise<TravelGuestDto> {
    await this.assertManager(userId, stayId);
    const input = this.parse(body);
    await this.assertRoom(stayId, input.roomId);
    const row = await this.prisma.travelGuest.create({
      data: { ...input, stayId },
      select: guestSelect,
    });
    return this.toDto(row, 0);
  }

  async update(
    userId: string,
    stayId: string,
    guestId: string,
    body: Record<string, unknown>,
  ): Promise<TravelGuestDto> {
    await this.assertManager(userId, stayId);
    await this.findGuest(stayId, guestId);
    const input = this.parse(body);
    await this.assertRoom(stayId, input.roomId);
    const row = await this.prisma.travelGuest.update({
      where: { id: guestId },
      data: input,
      select: guestSelect,
    });
    const paid = await this.paidNightsByGuest([guestId]);
    return this.toDto(row, paid.get(guestId) ?? 0);
  }

  async remove(userId: string, stayId: string, guestId: string): Promise<void> {
    await this.assertManager(userId, stayId);
    const guest = await this.findGuest(stayId, guestId);
    // Записи кассы остаются без гостя (SetNull): деньги из истории не уходят.
    await this.prisma.travelGuest.delete({ where: { id: guestId } });
    await this.photos.remove(guest.photoKey);
  }

  async setPhoto(
    userId: string,
    stayId: string,
    guestId: string,
    file: UploadedGuestPhoto | undefined,
  ): Promise<TravelGuestDto> {
    await this.assertManager(userId, stayId);
    const guest = await this.findGuest(stayId, guestId);
    if (!file) throw new BadRequestException('Приложите фото');
    if (!GUEST_PHOTO_MIME.has(file.mimetype)) {
      throw new BadRequestException('Фото — JPEG, PNG или WebP');
    }
    if (file.size > MAX_GUEST_PHOTO_BYTES) {
      throw new BadRequestException('Фото больше 10 МБ');
    }
    if (!this.photos.configured) {
      throw new ServiceUnavailableException(
        'Хранилище фото не настроено — карточку можно вести без фото',
      );
    }
    const key = await this.photos.store(stayId, file);
    const row = await this.prisma.travelGuest.update({
      where: { id: guestId },
      data: { photoKey: key },
      select: guestSelect,
    });
    await this.photos.remove(guest.photoKey);
    const paid = await this.paidNightsByGuest([guestId]);
    return this.toDto(row, paid.get(guestId) ?? 0);
  }

  async removePhoto(
    userId: string,
    stayId: string,
    guestId: string,
  ): Promise<TravelGuestDto> {
    await this.assertManager(userId, stayId);
    const guest = await this.findGuest(stayId, guestId);
    const row = await this.prisma.travelGuest.update({
      where: { id: guestId },
      data: { photoKey: null },
      select: guestSelect,
    });
    await this.photos.remove(guest.photoKey);
    const paid = await this.paidNightsByGuest([guestId]);
    return this.toDto(row, paid.get(guestId) ?? 0);
  }

  private async paidNightsByGuest(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const groups = await this.prisma.travelCashEntry.groupBy({
      by: ['guestId'],
      where: { guestId: { in: ids }, kind: 'income' },
      _sum: { nights: true },
    });
    return new Map(
      groups
        .filter((group) => group.guestId)
        .map((group) => [group.guestId as string, group._sum.nights ?? 0]),
    );
  }

  private async toDto(
    row: GuestRow,
    paidNights: number,
  ): Promise<TravelGuestDto> {
    const through = paidThrough(row.checkInOn, paidNights);
    return {
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      photoUrl: await this.photos.signedUrl(row.photoKey),
      keyLabel: row.keyLabel,
      roomId: row.roomId,
      roomLabel: row.room ? roomLabel(row.room) : null,
      personalInfo: row.personalInfo,
      color: row.color as TravelGuestColor,
      checkInOn: formatStayDate(row.checkInOn),
      leftOn: row.leftOn ? formatStayDate(row.leftOn) : null,
      living: row.leftOn === null,
      paidNights,
      paidThrough: through ? formatStayDate(through) : null,
      unpaidNights: unpaidNights(
        row.checkInOn,
        row.leftOn,
        paidNights,
        new Date(),
      ),
    };
  }

  private parse(body: Record<string, unknown>) {
    try {
      return parseGuestInput(body);
    } catch (error) {
      if (error instanceof CashInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async assertRoom(stayId: string, roomId: string | null) {
    if (!roomId) return;
    const room = await this.prisma.travelRoom.findFirst({
      where: { id: roomId, stayId },
      select: { id: true },
    });
    if (!room) throw new BadRequestException('Такой комнаты у объекта нет');
  }

  private async findGuest(stayId: string, guestId: string) {
    const guest = await this.prisma.travelGuest.findFirst({
      where: { id: guestId, stayId },
      select: { id: true, photoKey: true },
    });
    if (!guest) throw new NotFoundException('Гость не найден');
    return guest;
  }

  private async assertManager(userId: string, stayId: string) {
    const stay = await this.prisma.travelStay.findFirst({
      where: { id: stayId, managers: { some: { userId } } },
      select: { id: true },
    });
    if (!stay) throw new NotFoundException('Объект не найден');
  }
}
