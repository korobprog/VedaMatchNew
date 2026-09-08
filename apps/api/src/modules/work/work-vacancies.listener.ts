import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Имена событий литералами: модули не импортируют друг друга, а
 * @vedamatch/shared не собирается и значения оттуда не вывозятся.
 */
const VACANCY_EVENTS = {
  responseCreated: 'vacancies.response.created',
  responseStatusChanged: 'vacancies.response.status-changed',
  offerClosed: 'vacancies.offer.closed',
} as const;

type EventOf<TName extends NotificationEvent['name']> = Extract<
  NotificationEvent,
  { name: TName }
>;

/**
 * «Мой день» показывает и отклики человека в «Вакансиях»: ждёт ответа, в
 * диалоге, принят. Работа хранит для этого свою минимальную запись,
 * собранную из событий, — таблицы «Вакансий» не читаются.
 *
 * Порядок событий не гарантирован: смена статуса может прийти раньше, чем
 * мы успели записать отклик (или запись пропала с удалением аккаунта).
 * Поэтому обновление — только по существующей строке, без создания.
 */
@Injectable()
export class WorkVacanciesListener {
  private readonly logger = new Logger(WorkVacanciesListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(VACANCY_EVENTS.responseCreated)
  async onResponseCreated(
    event: EventOf<'vacancies.response.created'>,
  ): Promise<void> {
    try {
      await this.prisma.workVacancyResponse.upsert({
        where: { responseId: event.responseId },
        // Повторный отклик после отзыва — тот же responseId: строка
        // оживает, а не дублируется.
        update: { status: 'new', offerTitle: event.offerTitle },
        create: {
          userId: event.responderId,
          responseId: event.responseId,
          offerId: event.offerId,
          offerTitle: event.offerTitle,
          offerKind: event.offerKind,
          status: 'new',
        },
      });
    } catch (error) {
      this.warn(event.responseId, error);
    }
  }

  @OnEvent(VACANCY_EVENTS.responseStatusChanged)
  async onStatusChanged(
    event: EventOf<'vacancies.response.status-changed'>,
  ): Promise<void> {
    try {
      await this.prisma.workVacancyResponse.updateMany({
        where: { responseId: event.responseId },
        data: { status: event.status },
      });
    } catch (error) {
      this.warn(event.responseId, error);
    }
  }

  @OnEvent(VACANCY_EVENTS.offerClosed)
  async onOfferClosed(event: EventOf<'vacancies.offer.closed'>): Promise<void> {
    try {
      await this.prisma.workVacancyResponse.updateMany({
        where: { responseId: event.responseId },
        data: { status: 'closed' },
      });
    } catch (error) {
      this.warn(event.responseId, error);
    }
  }

  private warn(responseId: string, error: unknown) {
    this.logger.warn(
      `Отклик ${responseId} не записан в агенду: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
