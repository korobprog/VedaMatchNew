import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  type ChatConferenceDto,
  type ChatConferenceInviteDto,
  type CreateChatConferenceRequest,
} from '@vedamatch/shared';
import { publicOrigin } from '../../../common/public-origin';
import { PrismaService } from '../../../prisma/prisma.service';
import { toUserSummary } from '../chat-dto';
import { chatUserSelect } from '../chat-selects';
import {
  CONFERENCE_MAX_PARTICIPANTS,
  conferenceDenialText,
  conferenceJoinDecision,
  conferenceLinkExpiry,
  conferenceLinkState,
  conferenceLinkUrl,
  conferenceTitle,
  createConferenceToken,
} from './conference-link';

const linkInclude = {
  createdBy: { select: chatUserSelect },
  conversation: {
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: chatUserSelect } },
      },
      groupCalls: { where: { status: 'live' as const }, select: { id: true } },
    },
  },
} satisfies Prisma.ChatConferenceLinkInclude;

type LinkRow = Prisma.ChatConferenceLinkGetPayload<{
  include: typeof linkInclude;
}>;

/** Сколько раз пробуем разойтись с занятым токеном, прежде чем сдаться. */
const TOKEN_ATTEMPTS = 3;

/**
 * Быстрая конференция по ссылке (VED-360).
 *
 * ## Почему комната — обычная беседа
 *
 * Развилка была такая: завести отдельную сущность «комната конференции»
 * или собрать её из того, что уже есть. Выбрана беседа — групповая,
 * закрытая, с владельцем, — и на это три причины, каждая из которых сама
 * по себе решает вопрос.
 *
 * 1. **Права и состав уже написаны.** «Кто внутри», «кто вышел», «кого
 *    пускать писать», «кто владелец», блокировки, жалобы, удаление,
 *    хранение — всё это у беседы есть и проверено. Отдельная комната
 *    означала бы второй набор тех же правил, который разъедется с первым
 *    на первой же правке.
 * 2. **Групповой звонок уже живёт в беседе.** `ChatGroupCall` заводится
 *    ровно на `conversationId` (VED-293). Комната без беседы потребовала
 *    бы переписать и его — ради того же самого.
 * 3. **Человеку достаётся больше, а не меньше.** В конференции есть чат,
 *    файлы, история и список участников с первой секунды; после разговора
 *    остаётся беседа, в которой можно дослать ссылку или расшифровку.
 *    Zoom с его «комната исчезла вместе со звонком» здесь не образец.
 *
 * Платой была бы лишняя беседа в списке у каждого, кто зашёл по ссылке, —
 * но это ровно то, чего человек и ждёт: он видит, куда ходил.
 *
 * Поэтому в базе появилась ОДНА новая строка — `ChatConferenceLink`, дверь.
 * Всё остальное — существующие `ChatConversation`, `ChatMember`,
 * `ChatGroupCall`.
 *
 * ## Модель доступа
 *
 * Ссылка — это ключ ровно от одной двери. Пройдя её, человек становится
 * обычным участником ОДНОЙ закрытой беседы и не получает ничего сверх:
 * ни других бесед, ни справочника, ни доступа к переписке хозяина. Сама
 * дверь узкая: 32 символа base64url (192 бита), срок
 * `CHAT_CONFERENCE_LINK_TTL_HOURS` часов, отзыв в один щелчок, потолок
 * `CONFERENCE_MAX_PARTICIPANTS` — и взаимная блокировка с хозяином
 * закрывает вход независимо от того, у кого ссылка оказалась.
 */
@Injectable()
export class ChatConferenceService {
  private readonly logger = new Logger(ChatConferenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Завести конференцию: беседа, владелец и ссылка — одним действием.
   * Формы нет намеренно: «быстрая» означает, что между желанием позвать и
   * готовой ссылкой не должно быть ни одного экрана.
   */
  async create(
    userId: string,
    dto: CreateChatConferenceRequest = {},
  ): Promise<ChatConferenceDto> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: chatUserSelect,
    });
    if (!me) throw new NotFoundException('Профиль не найден');
    const title = conferenceTitle(toUserSummary(me).name, dto.title);

    const conversation = await this.prisma.chatConversation.create({
      data: {
        kind: 'group',
        state: 'active',
        // Закрытая: конференция по ссылке не должна попадать в каталог
        // общин и в поиск — единственный вход в неё это ссылка.
        visibility: 'private',
        title,
        createdById: userId,
        members: { create: [{ userId, role: 'owner' }] },
      },
      select: { id: true },
    });

    const now = new Date();
    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
      try {
        const link = await this.prisma.chatConferenceLink.create({
          data: {
            conversationId: conversation.id,
            token: createConferenceToken(),
            createdById: userId,
            expiresAt: conferenceLinkExpiry(now),
          },
          include: linkInclude,
        });
        return this.toDto(link, now);
      } catch (error) {
        // Совпадение 192-битных токенов практически невозможно, но если
        // база сказала «занято» — честнее взять другой, чем отдать чужую
        // комнату.
        if (!isUniqueViolation(error) || attempt === TOKEN_ATTEMPTS - 1)
          throw error;
      }
    }
    /* c8 ignore next */
    throw new ConflictException(
      'Не удалось создать ссылку, попробуйте ещё раз',
    );
  }

  /**
   * Что видит открывший ссылку — в том числе гость без аккаунта. Наружу
   * идёт минимум: кто зовёт, сколько мест занято и можно ли войти. Ни
   * переписки, ни списка бесед хозяина здесь нет и быть не может.
   */
  async invite(
    token: string,
    userId: string | null,
  ): Promise<ChatConferenceInviteDto> {
    const link = await this.requireLink(token);
    const now = new Date();
    const state = conferenceLinkState(link, now);
    const seatsTaken = link.conversation.members.length;
    const alreadyMember = userId
      ? link.conversation.members.some((m) => m.userId === userId)
      : false;
    const decision = conferenceJoinDecision({
      state,
      seatsTaken,
      alreadyMember,
      blockedWithHost: userId
        ? await this.blockedWithHost(userId, link.createdById)
        : false,
    });

    return {
      title: link.conversation.title ?? 'Быстрая конференция',
      host: toUserSummary(link.createdBy),
      state,
      expiresAt: link.expiresAt.toISOString(),
      seatsTaken,
      maxParticipants: CONFERENCE_MAX_PARTICIPANTS,
      callLive: link.conversation.groupCalls.length > 0,
      alreadyMember,
      denial:
        decision.kind === 'deny' ? conferenceDenialText(decision.reason) : null,
    };
  }

  /**
   * Войти по ссылке. Возвращает комнату — дальше клиенту остаётся открыть
   * беседу и начать (или подхватить) звонок, без промежуточных экранов.
   *
   * Счёт мест идёт в транзакции: два пятых, нажавших одновременно, иначе
   * оба прошли бы проверку и оба попали бы в комнату, из которой звонок
   * выставит одного — уже после «здравствуйте».
   */
  async join(token: string, userId: string): Promise<ChatConferenceDto> {
    const link = await this.requireLink(token);
    const now = new Date();
    const state = conferenceLinkState(link, now);
    const blockedWithHost = await this.blockedWithHost(
      userId,
      link.createdById,
    );

    const decision = conferenceJoinDecision({
      state,
      seatsTaken: link.conversation.members.length,
      alreadyMember: link.conversation.members.some((m) => m.userId === userId),
      blockedWithHost,
    });
    if (decision.kind === 'deny')
      throw new ConflictException(conferenceDenialText(decision.reason));

    if (decision.kind === 'enter') {
      await this.prisma.$transaction(async (tx) => {
        const seats = await tx.chatMember.count({
          where: { conversationId: link.conversationId, leftAt: null },
        });
        if (seats >= CONFERENCE_MAX_PARTICIPANTS)
          throw new ConflictException(conferenceDenialText('full'));
        await tx.chatMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: link.conversationId,
              userId,
            },
          },
          create: { conversationId: link.conversationId, userId },
          // Вернувшийся переиспользует свою строку: второй записи о том же
          // человеке в беседе быть не может.
          update: { leftAt: null },
        });
      });
    }

    return this.toDto(await this.requireLink(token), now);
  }

  /** Ссылка своей комнаты: её надо мочь скопировать ещё раз по ходу разговора. */
  async forConversation(
    conversationId: string,
    userId: string,
  ): Promise<ChatConferenceDto> {
    const link = await this.requireLinkForMember(conversationId, userId);
    return this.toDto(link, new Date());
  }

  /**
   * Закрыть вход по ссылке. Тех, кто уже внутри, это не выставляет — отзыв
   * про чужих. Идемпотентен: второй щелчок по «закрыть» не должен быть
   * ошибкой.
   */
  async revoke(
    conversationId: string,
    userId: string,
  ): Promise<ChatConferenceDto> {
    const link = await this.requireLinkForHost(conversationId, userId);
    if (!link.revokedAt)
      await this.prisma.chatConferenceLink.update({
        where: { id: link.id },
        data: { revokedAt: new Date() },
      });
    return this.toDto(
      await this.requireLinkForMember(conversationId, userId),
      new Date(),
    );
  }

  /**
   * Выдать новую ссылку взамен прежней: старая перестаёт работать в ту же
   * секунду. Это и «передумал отзывать», и «ссылка утекла не туда» — в
   * обоих случаях человеку нужна не отмена отзыва, а другая дверь.
   */
  async rotate(
    conversationId: string,
    userId: string,
  ): Promise<ChatConferenceDto> {
    const link = await this.requireLinkForHost(conversationId, userId);
    const now = new Date();
    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
      try {
        await this.prisma.chatConferenceLink.update({
          where: { id: link.id },
          data: {
            token: createConferenceToken(),
            revokedAt: null,
            expiresAt: conferenceLinkExpiry(now),
          },
        });
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === TOKEN_ATTEMPTS - 1)
          throw error;
      }
    }
    return this.toDto(
      await this.requireLinkForMember(conversationId, userId),
      now,
    );
  }

  // ---------- внутреннее ----------

  /**
   * Ссылка по токену. «Не найдено» и на отсутствующую, и на неверную по
   * форме: перебором нельзя узнать даже того, что комната существует.
   */
  private async requireLink(token: string): Promise<LinkRow> {
    const link = await this.prisma.chatConferenceLink.findUnique({
      where: { token },
      include: linkInclude,
    });
    if (!link) throw new NotFoundException('Такой конференции нет');
    return link;
  }

  private async requireLinkForMember(
    conversationId: string,
    userId: string,
  ): Promise<LinkRow> {
    const link = await this.prisma.chatConferenceLink.findUnique({
      where: { conversationId },
      include: linkInclude,
    });
    // Постороннему беседа отвечает «не найдено», а не «нельзя»: иначе
    // перебором id узнаётся, что конференция есть.
    if (!link || !link.conversation.members.some((m) => m.userId === userId))
      throw new NotFoundException('Такой конференции нет');
    return link;
  }

  /** Отзывать и менять ссылку вправе владелец беседы или её администратор. */
  private async requireLinkForHost(
    conversationId: string,
    userId: string,
  ): Promise<LinkRow> {
    const link = await this.requireLinkForMember(conversationId, userId);
    const mine = link.conversation.members.find((m) => m.userId === userId);
    if (!mine || (mine.role !== 'owner' && mine.role !== 'admin'))
      throw new ForbiddenException(
        'Ссылку закрывает тот, кто открыл конференцию',
      );
    return link;
  }

  /**
   * Взаимная блокировка с хозяином комнаты. `UserBlock` — портальная
   * модель, читать её модулю разрешено контрактом.
   */
  private async blockedWithHost(
    userId: string,
    hostId: string,
  ): Promise<boolean> {
    if (userId === hostId) return false;
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: hostId },
          { blockerId: hostId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    return Boolean(block);
  }

  /**
   * Публичный адрес портала. Ссылка собирается сервером, а не клиентом:
   * приложению домен портала неоткуда взять, а вебу — незачем знать второй
   * раз. `WEB_ORIGIN` хранит список через запятую, и в ссылку годится
   * только первый адрес (см. `common/public-origin.ts`).
   */
  private webOrigin(): string {
    const origin =
      publicOrigin(this.config.get<string>('WEB_ORIGIN')) ??
      publicOrigin(this.config.get<string>('WEB_URL'));
    if (origin) return origin;
    if (this.config.get<string>('NODE_ENV') === 'production')
      this.logger.error(
        'WEB_ORIGIN не задан — ссылки на конференции уйдут на localhost',
      );
    return 'http://localhost:3000';
  }

  private toDto(link: LinkRow, now: Date): ChatConferenceDto {
    return {
      conversationId: link.conversationId,
      title: link.conversation.title ?? 'Быстрая конференция',
      url: conferenceLinkUrl(this.webOrigin(), link.token),
      state: conferenceLinkState(link, now),
      expiresAt: link.expiresAt.toISOString(),
      revokedAt: link.revokedAt?.toISOString() ?? null,
      seatsTaken: link.conversation.members.length,
      maxParticipants: CONFERENCE_MAX_PARTICIPANTS,
      callLive: link.conversation.groupCalls.length > 0,
    };
  }
}

/** P2002 — нарушение уникального индекса; `code` у `PrismaClientKnownRequestError`. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}
