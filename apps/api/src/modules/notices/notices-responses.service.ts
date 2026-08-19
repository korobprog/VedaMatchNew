import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NoticeResponse, Notice } from '@prisma/client';
import {
  NOTICE_RESPONSE_MESSAGE_MAX_LENGTH,
  NOTICE_RESPONSES_PER_DAY,
  NOTICE_THANKS_NOTE_MAX_LENGTH,
  resolveDisplayName,
  type CreateNoticeResponseRequest,
  type CreateNoticeThanksRequest,
  type MyNoticeResponsesResponse,
  type NoticeKarmaDto,
  type NoticeResponseDto,
  type NoticeResponsesResponse,
  type ProfileMessengers,
  type ProfileSocialLinks,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NoticesService } from './notices.service';

type ResponseRow = NoticeResponse & {
  notice: Pick<Notice, 'id' | 'titleRu' | 'titleEn' | 'authorId'>;
  user: {
    id: string;
    name: string;
    spiritualName: string | null;
    avatarUrl: string | null;
    homeLocation: unknown;
  };
};

const RESPONSE_USER_SELECT = {
  id: true,
  name: true,
  // spiritualName обязателен рядом с любым DTO наружу — правило контракта.
  spiritualName: true,
  avatarUrl: true,
  homeLocation: true,
} as const;

const RESPONSE_INCLUDE = {
  notice: {
    select: { id: true, titleRu: true, titleEn: true, authorId: true },
  },
  user: { select: RESPONSE_USER_SELECT },
} as const;

@Injectable()
export class NoticesResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly notices: NoticesService,
  ) {}

  /**
   * Отклик на объявление.
   *
   * Направление важно: пишет откликающийся автору, а не наоборот. Автор
   * не получает контакты откликнувшегося, пока сам не ответит согласием —
   * иначе доска стала бы способом собрать базу преданных.
   */
  async create(
    userId: string,
    noticeId: string,
    body: CreateNoticeResponseRequest,
  ): Promise<NoticeResponseDto> {
    const notice = await this.prisma.notice.findUnique({
      where: { id: noticeId },
      select: { id: true, authorId: true, status: true, expiresAt: true },
    });
    if (!notice) throw new NotFoundException('Объявление не найдено');
    if (notice.authorId === userId)
      throw new BadRequestException('Это ваше объявление');
    if (notice.status !== 'published' || notice.expiresAt <= new Date())
      throw new BadRequestException('Объявление больше не активно');
    // Откликнуться можно только на то, что видно в ленте: объявление «для
    // моей общины/города» или заблокированного автора для чужого — 404, а не
    // канал связи в обход аудитории.
    await this.notices.assertVisible(noticeId, userId);

    const message = body.message?.trim() || null;
    if (message && message.length > NOTICE_RESPONSE_MESSAGE_MAX_LENGTH)
      throw new BadRequestException('Сообщение слишком длинное');

    const existing = await this.prisma.noticeResponse.findUnique({
      where: { noticeId_userId: { noticeId, userId } },
    });
    // Второй отклик на то же объявление — это правка первого, а не новая
    // запись: иначе автор получал бы дубли уведомлений.
    if (existing && existing.status !== 'withdrawn')
      throw new BadRequestException('Вы уже откликнулись');

    await this.assertDailyLimit(userId);

    const row = existing
      ? await this.prisma.noticeResponse.update({
          where: { noticeId_userId: { noticeId, userId } },
          // createdAt сдвигаем: повторный отклик после отзыва — новая
          // попытка и тратит суточный лимит, а не обходит его.
          data: {
            message,
            status: 'open',
            respondedAt: null,
            createdAt: new Date(),
          },
          include: RESPONSE_INCLUDE,
        })
      : await this.prisma.noticeResponse.create({
          data: { noticeId, userId, message },
          include: RESPONSE_INCLUDE,
        });
    await this.recount(noticeId);
    // Автор узнаёт об отклике пушем. Событие самодостаточно: формулировку
    // пишет модуль уведомлений, мы сообщаем только факт.
    this.events.emit('notices.response.received', {
      name: 'notices.response.received',
      recipientId: notice.authorId,
      senderName: resolveDisplayName(row.user),
      noticeTitle: row.notice.titleRu ?? row.notice.titleEn ?? 'Объявление',
      noticeId,
    });
    return this.toDto(row, userId, null);
  }

  /** Отклики на объявление — видит только его автор. */
  async listForNotice(
    userId: string,
    isAdmin: boolean,
    noticeId: string,
  ): Promise<NoticeResponsesResponse> {
    const notice = await this.prisma.notice.findUnique({
      where: { id: noticeId },
      select: { authorId: true },
    });
    if (!notice) throw new NotFoundException('Объявление не найдено');
    if (notice.authorId !== userId && !isAdmin)
      throw new NotFoundException('Объявление не найдено');

    const rows = await this.prisma.noticeResponse.findMany({
      where: { noticeId, status: { not: 'withdrawn' } },
      include: RESPONSE_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    // Автору контакты откликнувшегося раскрываются после его же согласия.
    const contacts = await this.contactsFor(
      rows.filter((row) => row.status === 'accepted').map((row) => row.userId),
    );
    return {
      items: rows.map((row) =>
        this.toDto(row, userId, contacts.get(row.userId) ?? null),
      ),
    };
  }

  /** «Куда я откликнулся». */
  async listMine(userId: string): Promise<MyNoticeResponsesResponse> {
    const rows = await this.prisma.noticeResponse.findMany({
      where: { userId, status: { not: 'withdrawn' } },
      include: RESPONSE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    // Откликнувшемуся раскрываются контакты автора — но только принятых.
    const contacts = await this.contactsFor(
      rows
        .filter((row) => row.status === 'accepted')
        .map((row) => row.notice.authorId),
    );
    const sentToday = await this.countToday(userId);
    return {
      items: rows.map((row) =>
        this.toDto(row, userId, contacts.get(row.notice.authorId) ?? null),
      ),
      remainingToday: Math.max(0, NOTICE_RESPONSES_PER_DAY - sentToday),
    };
  }

  /** Ответ автора объявления на отклик. */
  async respond(
    userId: string,
    responseId: string,
    accept: boolean,
  ): Promise<NoticeResponseDto> {
    const row = await this.prisma.noticeResponse.findUnique({
      where: { id: responseId },
      include: RESPONSE_INCLUDE,
    });
    if (!row || row.notice.authorId !== userId)
      throw new NotFoundException('Отклик не найден');
    if (row.status !== 'open')
      throw new BadRequestException('По этому отклику уже есть решение');

    const updated = await this.prisma.noticeResponse.update({
      where: { id: responseId },
      data: {
        status: accept ? 'accepted' : 'declined',
        respondedAt: new Date(),
      },
      include: RESPONSE_INCLUDE,
    });
    // Отказ контактов не раскрывает — пустая карта, а не запрос в БД.
    if (accept)
      this.events.emit('notices.response.accepted', {
        name: 'notices.response.accepted',
        recipientId: updated.userId,
        noticeTitle:
          updated.notice.titleRu ?? updated.notice.titleEn ?? 'Объявление',
        noticeId: updated.noticeId,
      });
    const contacts = accept
      ? await this.contactsFor([updated.userId])
      : await this.contactsFor([]);
    return this.toDto(updated, userId, contacts.get(updated.userId) ?? null);
  }

  /** Отзыв своего отклика. */
  async withdraw(userId: string, responseId: string): Promise<void> {
    const row = await this.prisma.noticeResponse.findUnique({
      where: { id: responseId },
      select: { userId: true, noticeId: true },
    });
    if (!row || row.userId !== userId)
      throw new NotFoundException('Отклик не найден');
    await this.prisma.noticeResponse.update({
      where: { id: responseId },
      data: { status: 'withdrawn' },
    });
    await this.recount(row.noticeId);
  }

  // ===== Благодарности =====

  /**
   * Благодарность. Сказать «спасибо» может участник обмена — автор
   * объявления или тот, кто на него откликнулся: иначе счётчик накручивался
   * бы посторонними.
   */
  async thank(
    userId: string,
    noticeId: string,
    body: CreateNoticeThanksRequest,
  ): Promise<NoticeKarmaDto> {
    const notice = await this.prisma.notice.findUnique({
      where: { id: noticeId },
      select: { id: true, authorId: true },
    });
    if (!notice) throw new NotFoundException('Объявление не найдено');
    if (body.toUserId === userId)
      throw new BadRequestException('Себя благодарить не нужно');

    const note = body.note?.trim() || null;
    if (note && note.length > NOTICE_THANKS_NOTE_MAX_LENGTH)
      throw new BadRequestException('Сообщение слишком длинное');

    const [iParticipate, targetParticipates] = await Promise.all([
      this.participates(noticeId, notice.authorId, userId),
      this.participates(noticeId, notice.authorId, body.toUserId),
    ]);
    if (!iParticipate || !targetParticipates)
      throw new ForbiddenException(
        'Благодарить можно только участников этого объявления',
      );

    await this.prisma.noticeThanks.upsert({
      where: { noticeId_fromUserId: { noticeId, fromUserId: userId } },
      update: { toUserId: body.toUserId, note },
      create: { noticeId, fromUserId: userId, toUserId: body.toUserId, note },
    });
    const thanksCount = await this.prisma.noticeThanks.count({
      where: { noticeId },
    });
    await this.prisma.notice.update({
      where: { id: noticeId },
      data: { thanksCount },
    });
    return this.karma(body.toUserId);
  }

  /**
   * Счётчик «спасибо» человека. Считается запросом, а не денормализованной
   * колонкой: писать в портальный `User` сервису запрещено, а своя таблица
   * счётчиков на этих объёмах только добавила бы способ разъехаться.
   */
  async karma(userId: string): Promise<NoticeKarmaDto> {
    const thanksCount = await this.prisma.noticeThanks.count({
      where: { toUserId: userId },
    });
    return { userId, thanksCount };
  }

  // ===== Внутреннее =====

  private async participates(
    noticeId: string,
    authorId: string,
    userId: string,
  ): Promise<boolean> {
    if (authorId === userId) return true;
    const response = await this.prisma.noticeResponse.findUnique({
      where: { noticeId_userId: { noticeId, userId } },
      select: { status: true },
    });
    return response !== null && response.status !== 'withdrawn';
  }

  private async contactsFor(userIds: string[]) {
    const map = new Map<
      string,
      { socialLinks: ProfileSocialLinks; messengers: ProfileMessengers }
    >();
    if (!userIds.length) return map;
    // Портальный профиль читается read-only — это разрешено контрактом.
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, socialLinks: true, messengers: true },
    });
    for (const user of users)
      map.set(user.id, {
        socialLinks: (user.socialLinks as ProfileSocialLinks | null) ?? {},
        messengers: (user.messengers as ProfileMessengers | null) ?? {},
      });
    return map;
  }

  private countToday(userId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.prisma.noticeResponse.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  /**
   * Суточный лимит откликов. Без него доска превращается в рассылку:
   * откликнулся на сорок объявлений — сорок человек получили твоё имя.
   */
  private async assertDailyLimit(userId: string) {
    if ((await this.countToday(userId)) >= NOTICE_RESPONSES_PER_DAY)
      throw new BadRequestException('Слишком много откликов за сутки');
  }

  /** Счётчик откликов пересчитывается запросом: отзыв уменьшает его. */
  private async recount(noticeId: string) {
    const responsesCount = await this.prisma.noticeResponse.count({
      where: { noticeId, status: { not: 'withdrawn' } },
    });
    await this.prisma.notice.update({
      where: { id: noticeId },
      data: { responsesCount },
    });
  }

  private toDto(
    row: ResponseRow,
    _viewerId: string,
    contacts: {
      socialLinks: ProfileSocialLinks;
      messengers: ProfileMessengers;
    } | null,
  ): NoticeResponseDto {
    const location = row.user.homeLocation as { city?: string } | null;
    return {
      id: row.id,
      noticeId: row.noticeId,
      noticeTitle: row.notice.titleRu ?? row.notice.titleEn ?? 'Без названия',
      status: row.status,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
      user: {
        userId: row.userId,
        name: resolveDisplayName(row.user),
        avatarUrl: row.user.avatarUrl,
        city: location?.city ?? null,
      },
      contacts,
    };
  }
}
