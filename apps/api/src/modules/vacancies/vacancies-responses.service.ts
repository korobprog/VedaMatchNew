import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  VACANCY_RESPONSES_PER_DAY,
  VACANCY_RESPONSE_MESSAGE_MAX_LENGTH,
  resolveDisplayName,
  type CreateVacancyResponseRequest,
  type MyVacancyResponsesResponse,
  type UpdateVacancyResponseStatusRequest,
  type VacancyResponseDto,
  type VacancyResponsesResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RESPONSE_INCLUDE, toResponseDto } from './vacancy-dto';
import {
  VACANCY_EVENTS,
  type VacancyResponseCreatedEvent,
  type VacancyResponseStatusChangedEvent,
} from './vacancy-events';
import { VacanciesService } from './vacancies.service';

const AUTHOR_DECISIONS: UpdateVacancyResponseStatusRequest['status'][] = [
  'in_dialog',
  'accepted',
  'declined',
];

/**
 * Отклики. Соискатель приходит своим профилем, без резюме: работодатель
 * видит только тех, кто откликнулся сам, а не ищет по людям.
 */
@Injectable()
export class VacanciesResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly offers: VacanciesService,
  ) {}

  async create(
    userId: string,
    offerId: string,
    body: CreateVacancyResponseRequest,
  ): Promise<VacancyResponseDto> {
    const offer = await this.prisma.vacancyOffer.findUnique({
      where: { id: offerId },
      select: { id: true, authorId: true, status: true, expiresAt: true },
    });
    if (!offer) throw new NotFoundException('Предложение не найдено');
    if (offer.authorId === userId)
      throw new BadRequestException('Это ваше предложение');
    if (offer.status !== 'published' || offer.expiresAt <= new Date())
      throw new BadRequestException('Предложение больше не активно');
    // Откликнуться можно только на то, что видно в ленте: «только моей
    // общине» не должно становиться каналом связи в обход аудитории.
    await this.offers.assertVisible(offerId, userId);

    const message = body.message?.trim() || null;
    if (message && message.length > VACANCY_RESPONSE_MESSAGE_MAX_LENGTH)
      throw new BadRequestException('Сообщение слишком длинное');

    const existing = await this.prisma.vacancyResponse.findUnique({
      where: { offerId_userId: { offerId, userId } },
    });
    // Второй отклик — правка первого, а не новая запись: иначе автор получал
    // бы дубли уведомлений.
    if (existing && existing.status !== 'withdrawn')
      throw new BadRequestException('Вы уже откликнулись');

    await this.assertDailyLimit(userId);

    const row = existing
      ? await this.prisma.vacancyResponse.update({
          where: { offerId_userId: { offerId, userId } },
          // createdAt сдвигаем: повторный отклик после отзыва — новая
          // попытка и тратит суточный лимит, а не обходит его.
          data: {
            message,
            status: 'new',
            respondedAt: null,
            createdAt: new Date(),
          },
          include: RESPONSE_INCLUDE,
        })
      : await this.prisma.vacancyResponse.create({
          data: { offerId, userId, message },
          include: RESPONSE_INCLUDE,
        });
    await this.recount(offerId);

    const event: VacancyResponseCreatedEvent = {
      name: VACANCY_EVENTS.responseCreated,
      offerId,
      offerTitle: row.offer.title,
      offerKind: row.offer.kind,
      responseId: row.id,
      recipientId: offer.authorId,
      responderId: userId,
      responderName: resolveDisplayName(row.user),
      message,
    };
    this.events.emit(event.name, event);
    return toResponseDto(row);
  }

  /** Воронка автора: отклики на одно предложение. */
  async listForOffer(
    userId: string,
    isAdmin: boolean,
    offerId: string,
  ): Promise<VacancyResponsesResponse> {
    const offer = await this.prisma.vacancyOffer.findUnique({
      where: { id: offerId },
      select: { authorId: true },
    });
    if (!offer || (offer.authorId !== userId && !isAdmin))
      throw new NotFoundException('Предложение не найдено');

    const rows = await this.prisma.vacancyResponse.findMany({
      where: { offerId, status: { not: 'withdrawn' } },
      include: RESPONSE_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(toResponseDto) };
  }

  /** «Куда я откликнулся». */
  async listMine(userId: string): Promise<MyVacancyResponsesResponse> {
    const rows = await this.prisma.vacancyResponse.findMany({
      where: { userId, status: { not: 'withdrawn' } },
      include: RESPONSE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const sentToday = await this.countToday(userId);
    return {
      items: rows.map(toResponseDto),
      remainingToday: Math.max(0, VACANCY_RESPONSES_PER_DAY - sentToday),
    };
  }

  /**
   * Решение автора. Порядок воронки не навязывается: из `new` можно и в
   * диалог, и сразу принять; но по закрытому решению назад хода нет.
   */
  async setStatus(
    userId: string,
    responseId: string,
    body: UpdateVacancyResponseStatusRequest,
  ): Promise<VacancyResponseDto> {
    if (!AUTHOR_DECISIONS.includes(body.status))
      throw new BadRequestException('Недопустимый статус');
    const row = await this.prisma.vacancyResponse.findUnique({
      where: { id: responseId },
      include: RESPONSE_INCLUDE,
    });
    if (!row || row.offer.authorId !== userId)
      throw new NotFoundException('Отклик не найден');
    if (row.status === 'withdrawn')
      throw new BadRequestException('Соискатель отозвал отклик');
    if (row.status === 'accepted' || row.status === 'declined')
      throw new BadRequestException('По этому отклику уже есть решение');
    if (row.status === body.status) return toResponseDto(row);

    const updated = await this.prisma.vacancyResponse.update({
      where: { id: responseId },
      data: {
        status: body.status,
        respondedAt: body.status === 'in_dialog' ? row.respondedAt : new Date(),
      },
      include: RESPONSE_INCLUDE,
    });
    const event: VacancyResponseStatusChangedEvent = {
      name: VACANCY_EVENTS.responseStatusChanged,
      offerId: updated.offerId,
      offerTitle: updated.offer.title,
      offerKind: updated.offer.kind,
      responseId: updated.id,
      recipientId: updated.userId,
      authorId: userId,
      status: body.status,
    };
    this.events.emit(event.name, event);
    return toResponseDto(updated);
  }

  /** Отзыв своего отклика. */
  async withdraw(userId: string, responseId: string): Promise<void> {
    const row = await this.prisma.vacancyResponse.findUnique({
      where: { id: responseId },
      select: { userId: true, offerId: true },
    });
    if (!row || row.userId !== userId)
      throw new NotFoundException('Отклик не найден');
    await this.prisma.vacancyResponse.update({
      where: { id: responseId },
      data: { status: 'withdrawn' },
    });
    await this.recount(row.offerId);
  }

  // ===== Внутреннее =====

  private countToday(userId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.prisma.vacancyResponse.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  /** Без суточного лимита лента превращается в рассылку своего имени. */
  private async assertDailyLimit(userId: string) {
    if ((await this.countToday(userId)) >= VACANCY_RESPONSES_PER_DAY)
      throw new BadRequestException('Слишком много откликов за сутки');
  }

  /** Счётчик пересчитывается запросом: отзыв уменьшает его. */
  private async recount(offerId: string) {
    const responsesCount = await this.prisma.vacancyResponse.count({
      where: { offerId, status: { not: 'withdrawn' } },
    });
    await this.prisma.vacancyOffer.update({
      where: { id: offerId },
      data: { responsesCount },
    });
  }
}
