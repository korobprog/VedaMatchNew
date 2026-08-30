import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type {
  AdminAuditEvent,
  AdminChatConversationsState,
  AdminChatDirectTranscript,
  AdminChatReportDecisionRequest,
  AdminChatReportsState,
  AdminChatStats,
  CreateChatReportRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { toUserSummary } from './chat-dto';
import { directKey } from './direct-key';
import { chatUserSelect } from './chat-selects';

/**
 * Сколько сообщений отдаёт расшифровка. Предел есть, потому что переписка
 * бывает в тысячи сообщений, а разбирают жалобу по последним.
 */
const TRANSCRIPT_LIMIT = 500;

/**
 * Чем оправдан просмотр — уезжает в журнал. Строка, а не булево: «смотрел»
 * без «на каком основании» разобрать потом невозможно.
 */
type TranscriptBasis = 'portal-report' | 'chat-report';

/**
 * Жалобы и админский раздел сервиса. Живут в модуле чата: общей модерации
 * незачем читать переписку, ей достаточно решения по конкретной жалобе.
 */
@Injectable()
export class ChatReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventEmitter2,
    // Портальная инфраструктура — её контракт сервисного модуля разрешает
    // наравне с AuthModule.
    private readonly moderation: ModerationService,
  ) {}

  async create(userId: string, dto: CreateChatReportRequest) {
    const reason = dto?.reason?.trim();
    if (!reason) throw new BadRequestException('Не указана причина');
    if (!dto.messageId && !dto.conversationId)
      throw new BadRequestException('Не указано, на что жалоба');

    // Жалобу принимаем только на то, что человек действительно видит:
    // иначе по перебору id можно узнать, существует ли беседа.
    if (dto.conversationId)
      await this.assertVisible(userId, dto.conversationId);
    if (dto.messageId) {
      const message = await this.prisma.chatMessage.findUnique({
        where: { id: dto.messageId },
        select: { conversationId: true },
      });
      if (!message) throw new BadRequestException('Сообщение не найдено');
      await this.assertVisible(userId, message.conversationId);
    }

    const created = await this.prisma.chatReport.create({
      data: {
        reporterId: userId,
        reason,
        comment: dto.comment?.trim() || null,
        messageId: dto.messageId ?? null,
        conversationId: dto.conversationId ?? null,
      },
    });

    this.bus.emit('chat.report.created', {
      name: 'chat.report.created',
      reportId: created.id,
    });
    return { id: created.id };
  }

  async adminList(status?: string): Promise<AdminChatReportsState> {
    const where: Prisma.ChatReportWhereInput =
      status === 'resolved' || status === 'rejected'
        ? { status }
        : { status: 'open' };

    const rows = await this.prisma.chatReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        reporter: { select: chatUserSelect },
        conversation: { select: { id: true, title: true, kind: true } },
        message: {
          select: {
            id: true,
            body: true,
            deletedAt: true,
            author: { select: chatUserSelect },
          },
        },
      },
    });

    const openCount = await this.prisma.chatReport.count({
      where: { status: 'open' },
    });

    return {
      reports: rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        comment: row.comment,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        reporter: toUserSummary(row.reporter),
        conversationId: row.conversationId,
        conversationTitle: row.conversation?.title ?? null,
        conversationKind: row.conversation?.kind ?? null,
        messageId: row.messageId,
        messageBody: row.message?.deletedAt ? '' : (row.message?.body ?? null),
        messageAuthor: row.message ? toUserSummary(row.message.author) : null,
        decision: row.decision,
        decidedAt: row.decidedAt?.toISOString() ?? null,
      })),
      openCount,
    };
  }

  /** Решение админа: `resolve` прячет сообщение, `reject` оставляет как есть. */
  async decide(
    adminId: string,
    reportId: string,
    dto: AdminChatReportDecisionRequest,
  ) {
    const report = await this.prisma.chatReport.findUnique({
      where: { id: reportId },
      select: { id: true, messageId: true, status: true },
    });
    if (!report) throw new BadRequestException('Жалоба не найдена');
    if (report.status !== 'open')
      throw new BadRequestException('По жалобе уже есть решение');

    if (dto.action === 'resolve' && report.messageId)
      await this.prisma.chatMessage.update({
        where: { id: report.messageId },
        data: { deletedAt: new Date() },
      });

    await this.prisma.chatReport.update({
      where: { id: reportId },
      data: {
        status: dto.action === 'resolve' ? 'resolved' : 'rejected',
        decidedAt: new Date(),
        decidedById: adminId,
        decision: dto.comment?.trim() || null,
      },
    });

    return { ok: true };
  }

  /**
   * Беседы для админки. Отдаём заголовки и счётчики, но не переписку:
   * разбор жалобы не повод читать чужие сообщения целиком.
   */
  /**
   * Переписка двоих — для разбора жалобы на человека.
   *
   * Личный диалог у пары ровно один (его держит `directKey`), поэтому пары
   * идентификаторов достаточно: искать беседу глазами администратору не нужно.
   *
   * Открывается только по неразобранной жалобе — портальной на человека либо
   * своей на эту беседу. Без этой проверки права администратора сервиса
   * означали чтение переписки любой пары по двум идентификаторам.
   *
   * Удалённые сообщения приходят с текстом и пометкой `deletedAt`. Это
   * осознанно: типовая травля — написать и стереть, и без стёртого разбирать
   * жалобу нечего. Границы у этого доступа три, и все три на сервере: живая
   * жалоба, запись в журнал ниже и срок хранения (ChatRetentionService), после
   * которого текста нет уже ни у кого. Прятать его на клиенте бессмысленно —
   * ответ всё равно виден тому, кто откроет средства разработчика.
   */
  async adminDirectTranscript(
    adminId: string,
    a: string,
    b: string,
  ): Promise<AdminChatDirectTranscript> {
    if (!a || !b || a === b)
      throw new BadRequestException('Не указана пара собеседников');

    const key = directKey(a, b);
    // Повод спрашиваем до поиска беседы: иначе по ответу «переписки нет»
    // перебором пар видно, кто с кем вообще говорил.
    const basis = await this.transcriptBasis(a, b, key);
    if (!basis)
      throw new ForbiddenException(
        'Переписку открывают по неразобранной жалобе',
      );

    const conversation = await this.prisma.chatConversation.findUnique({
      where: { directKey: key },
      select: { id: true },
    });
    if (!conversation)
      return { conversationId: null, messages: [], truncated: false };

    // Свежие, а не первые: в долгой переписке `asc` показывал начало
    // знакомства и обрезал ровно то, на что жалуются. Берём на одно больше
    // предела, чтобы отличить «ровно предел» от «есть ещё».
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: TRANSCRIPT_LIMIT + 1,
      select: {
        id: true,
        authorId: true,
        body: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        author: { select: { name: true } },
        _count: { select: { attachments: true } },
      },
    });
    const truncated = rows.length > TRANSCRIPT_LIMIT;
    const page = rows.slice(0, TRANSCRIPT_LIMIT).reverse();

    // Типизированное событие, а не литерал: без типа сюда уехало действие,
    // которого нет в списке журнала, и запись молча не создавалась — при том
    // что администратору обещано обратное.
    const event: AdminAuditEvent = {
      actorId: adminId,
      action: 'chat.transcript-viewed',
      targetType: 'user',
      targetId: b,
      details: {
        conversationId: conversation.id,
        messages: page.length,
        // По какой именно жалобе смотрели — иначе журнал говорит «смотрел»,
        // но не говорит «на каком основании».
        basis,
      },
    };
    this.bus.emit('admin.action', event);

    return {
      conversationId: conversation.id,
      truncated,
      messages: page.map((row) => ({
        id: row.id,
        authorId: row.authorId,
        // Мирское имя: разбор жалобы — то место, где нужно точно понимать,
        // кто перед тобой, а не под каким именем его видят в сервисе.
        authorName: row.author.name,
        body: row.body ?? '',
        createdAt: row.createdAt.toISOString(),
        editedAt: row.editedAt?.toISOString() ?? null,
        deletedAt: row.deletedAt?.toISOString() ?? null,
        attachments: row._count.attachments,
      })),
    };
  }

  /**
   * Чем оправдан просмотр переписки пары. Два повода, и оба должны быть
   * живыми:
   *
   * — портальная жалоба на человека в работе: с неё модератор и приходит,
   *   кнопка стоит на карточке жалобы. `UserReport` — чужая таблица, поэтому
   *   спрашиваем `ModerationService`, портальную инфраструктуру, а не читаем
   *   её сами;
   * — своя жалоба на эту беседу или на сообщение в ней: в разделе жалоб
   *   сервиса портальной может не быть вовсе.
   */
  private async transcriptBasis(
    a: string,
    b: string,
    key: string,
  ): Promise<TranscriptBasis | null> {
    if (await this.moderation.hasOpenReportBetween(a, b))
      return 'portal-report';

    const own = await this.prisma.chatReport.findFirst({
      where: {
        status: 'open',
        OR: [
          { conversation: { directKey: key } },
          { message: { conversation: { directKey: key } } },
        ],
      },
      select: { id: true },
    });
    return own ? 'chat-report' : null;
  }

  async adminConversations(
    query?: string,
  ): Promise<AdminChatConversationsState> {
    const needle = query?.trim();
    const rows = await this.prisma.chatConversation.findMany({
      where: needle
        ? {
            OR: [
              { title: { contains: needle, mode: 'insensitive' } },
              {
                community: { name: { contains: needle, mode: 'insensitive' } },
              },
            ],
          }
        : { kind: { in: ['group', 'channel'] } },
      include: {
        community: { select: { name: true } },
        _count: { select: { members: true, messages: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });

    return {
      conversations: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        state: row.state,
        // У личного диалога своего названия нет — в админке он так и
        // подписан, без имён участников: это разбор беседы, а не досье.
        title: row.title ?? 'Личный диалог',
        membersCount: row._count.members,
        messagesCount: row._count.messages,
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        communityName: row.community?.name ?? null,
      })),
    };
  }

  /**
   * Заморозить беседу или вернуть её к жизни. Замороженная переписка видна
   * участникам, но писать в неё нельзя: удалять чужие разговоры админ не
   * должен, а остановить свару — должен.
   */
  async freezeConversation(conversationId: string, frozen: boolean) {
    const row = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, state: true },
    });
    if (!row) throw new BadRequestException('Беседа не найдена');
    if (row.state === 'request' || row.state === 'declined')
      throw new BadRequestException('Запрос замораживать нечего');

    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { state: frozen ? 'archived' : 'active' },
    });
    return { state: frozen ? 'archived' : 'active' };
  }

  async stats(): Promise<AdminChatStats> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      conversations,
      directConversations,
      groups,
      channels,
      messages,
      messagesLast7Days,
      openReports,
    ] = await Promise.all([
      this.prisma.chatConversation.count(),
      this.prisma.chatConversation.count({ where: { kind: 'direct' } }),
      this.prisma.chatConversation.count({ where: { kind: 'group' } }),
      this.prisma.chatConversation.count({ where: { kind: 'channel' } }),
      this.prisma.chatMessage.count(),
      this.prisma.chatMessage.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.chatReport.count({ where: { status: 'open' } }),
    ]);

    return {
      conversations,
      directConversations,
      groups,
      channels,
      messages,
      messagesLast7Days,
      openReports,
    };
  }

  private async assertVisible(userId: string, conversationId: string) {
    const member = await this.prisma.chatMember.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });
    if (!member) throw new BadRequestException('Беседа не найдена');
  }
}
