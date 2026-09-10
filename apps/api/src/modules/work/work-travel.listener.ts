import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Имена событий литералами: модули не импортируют друг друга, а
 * @vedamatch/shared не вывозит сюда значений.
 */
const TRAVEL_EVENTS = {
  bookingCreated: 'travel.booking.created',
  bookingDecided: 'travel.booking.decided',
} as const;

type EventOf<TName extends NotificationEvent['name']> = Extract<
  NotificationEvent,
  { name: TName }
>;

/**
 * «Мой день» показывает управляющему заявки на ночлег из «Путешествий»:
 * кто приезжает, когда и на сколько.
 *
 * «Работа» хранит для этого свою минимальную запись, собранную из событий, —
 * ровно как у «Вакансий». Таблицы «Путешествий» отсюда не читаются: контракт
 * запрещает, и FK на чужую модель тоже.
 *
 * Порядок событий не гарантирован: решение по заявке может прийти раньше, чем
 * мы успели записать саму заявку (или запись пропала с удалением аккаунта).
 * Поэтому смена статуса — только по существующей строке, без создания: у нас
 * нет ни дат, ни имени гостя, чтобы завести её из решения.
 */
@Injectable()
export class WorkTravelListener {
  private readonly logger = new Logger(WorkTravelListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(TRAVEL_EVENTS.bookingCreated)
  async onBookingCreated(
    event: EventOf<'travel.booking.created'>,
  ): Promise<void> {
    try {
      const data = {
        bookingNumber: event.bookingNumber,
        stayId: event.stayId,
        stayName: event.stayName,
        guestName: event.guestName,
        checkIn: new Date(event.checkIn),
        checkOut: new Date(event.checkOut),
      };
      await this.prisma.workTravelBooking.upsert({
        // Повторная доставка события не должна множить карточки в «Моём дне».
        where: {
          userId_bookingId: {
            userId: event.recipientId,
            bookingId: event.bookingId,
          },
        },
        update: data,
        create: {
          ...data,
          userId: event.recipientId,
          bookingId: event.bookingId,
          status: 'new_request',
        },
      });
    } catch (error) {
      this.warn(event.bookingId, error);
    }
  }

  @OnEvent(TRAVEL_EVENTS.bookingDecided)
  async onStatusChanged(event: {
    bookingId: string;
    status: string;
  }): Promise<void> {
    try {
      // updateMany по одному bookingId: карточка в «Моём дне» есть у каждого
      // управляющего объектом, и обновиться должны все разом.
      await this.prisma.workTravelBooking.updateMany({
        where: { bookingId: event.bookingId },
        data: { status: event.status },
      });
    } catch (error) {
      this.warn(event.bookingId, error);
    }
  }

  private warn(bookingId: string, error: unknown): void {
    this.logger.warn(
      `Заявка на ночлег ${bookingId} не записана в «Мой день»: ${String(error)}`,
    );
  }
}
