import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import type {
  ContactsCreateRequestBody,
  ContactsDisclosureDto,
  ContactsDisclosuresState,
  ContactsOpenChatResponse,
  ContactsRequestDto,
  ContactsRequestStatus,
  ContactsRequestUser,
  ContactsRequestsState,
  ContactsRespondBody,
  ProfileLocation,
} from '@vedamatch/shared';
import { CONTACTS_REQUESTS_PER_DAY } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { UnionChatService } from '../union/union-chat.service';
import { UsersService } from '../users/users.service';
import type { ContactsDetails } from './contacts.service';
import { ContactsService } from './contacts.service';
import { isVerifiedDevotee } from './contacts-verification';

const MAX_MESSAGE_LENGTH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Пользователь, попадающий в списки запросов и раскрытий (всё read-only). */
interface PartyRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarKey: string | null;
  homeLocation: unknown;
  contactsProfile: { headline: string | null } | null;
}

const PARTY_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  avatarKey: true,
  homeLocation: true,
  contactsProfile: { select: { headline: true } },
} as const;

interface RequestRow {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string | null;
  status: ContactsRequestStatus;
  createdAt: Date;
  respondedAt: Date | null;
  fromUser: PartyRow;
  toUser: PartyRow;
}

/**
 * Связь в справочнике: запрос контакта, согласие, журнал раскрытий и отзыв.
 *
 * Отдельный сервис от `ContactsService` намеренно: там модель видимости
 * карточки, здесь — доступ к способам связи. Проверка видимости не дублируется,
 * а переиспользуется вызовом `ContactsService.getCard`.
 */
@Injectable()
export class ContactsRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly moderation: ModerationService,
    private readonly users: UsersService,
    private readonly events: EventEmitter2,
    private readonly unionChat: UnionChatService,
  ) {}

  /**
   * Отправить запрос контакта.
   *
   * Порядок проверок важен: сначала видимость (её отказ — всегда 404, чтобы
   * запрос не работал детектором «этот человек меня скрыл»), потом настройки
   * получателя, потом состояние прошлого запроса и только затем суточный
   * лимит — он тратится на настоящую отправку, а не на отбитые ошибки.
   */
  async create(
    userId: string,
    body: ContactsCreateRequestBody,
    now: Date = new Date(),
  ): Promise<ContactsRequestsState> {
    const toUserId = this.requireId(body?.toUserId);
    if (toUserId === userId) {
      throw new BadRequestException('Нельзя отправить запрос самому себе');
    }

    // Единственная проверка видимости в сервисе — та же, что у карточки.
    // Если карточка не видна, отсюда прилетит NotFoundException, и запрос
    // ничем не отличается от обращения к несуществующему человеку.
    await this.contacts.getCard(userId, toUserId, now);

    const profile = await this.prisma.contactsProfile.findUnique({
      where: { userId: toUserId },
      select: { requestsFromVerifiedOnly: true },
    });
    if (profile?.requestsFromVerifiedOnly && !(await this.isVerified(userId))) {
      throw new ForbiddenException(
        'Этот человек принимает обращения только от подтверждённых преданных',
      );
    }

    const message = this.message(body?.message);
    const existing = await this.prisma.contactsRequest.findUnique({
      where: { fromUserId_toUserId: { fromUserId: userId, toUserId } },
      select: { id: true, status: true },
    });
    if (existing?.status === 'pending') {
      throw new BadRequestException('Запрос уже отправлен');
    }
    // «Уже открыты» — только пока раскрытие действует. Владелец мог отозвать
    // доступ, и тогда принятый когда-то запрос не должен запирать человека
    // навсегда: контактов у него больше нет, а попросить снова нельзя.
    if (existing?.status === 'accepted') {
      const disclosure = await this.prisma.contactsDisclosure.findFirst({
        where: { ownerId: toUserId, viewerId: userId, revokedAt: null },
        select: { id: true },
      });
      if (disclosure) {
        throw new BadRequestException('Контакты уже открыты');
      }
    }

    await this.ensureUnderDailyLimit(userId, now);

    // `declined` и `cancelled` переоткрываются: человек мог передумать.
    // createdAt переставляется на «сейчас» — по нему считается суточный
    // лимит, и старая дата дала бы бесплатную попытку в обход лимита.
    await this.prisma.contactsRequest.upsert({
      where: { fromUserId_toUserId: { fromUserId: userId, toUserId } },
      create: { fromUserId: userId, toUserId, message, createdAt: now },
      update: {
        message,
        status: 'pending',
        createdAt: now,
        respondedAt: null,
      },
    });

    // Без уведомления запрос лежит молча, пока получатель сам не зайдёт
    // в раздел, — а весь сценарий держится на том, что он его увидел.
    this.emit({
      name: 'contacts.request.received',
      recipientId: toUserId,
      senderName: await this.displayName(userId),
    });

    return this.list(userId, now);
  }

  async list(
    userId: string,
    now: Date = new Date(),
  ): Promise<ContactsRequestsState> {
    const rows = (await this.prisma.contactsRequest.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      include: {
        fromUser: { select: PARTY_SELECT },
        toUser: { select: PARTY_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    })) as unknown as RequestRow[];

    // Открытые мне контакты — одним запросом на весь список, а не по строке.
    const openToMe = await this.openToMe(userId);

    const incoming: ContactsRequestDto[] = [];
    const outgoing: ContactsRequestDto[] = [];
    for (const row of rows) {
      const isIncoming = row.toUserId === userId;
      const other = isIncoming ? row.fromUser : row.toUser;
      const dto = await this.toRequestDto(
        row,
        isIncoming ? 'incoming' : 'outgoing',
        other,
        openToMe.get(other.id) ?? null,
      );
      (isIncoming ? incoming : outgoing).push(dto);
    }

    return {
      incoming,
      outgoing,
      remainingToday: Math.max(
        0,
        CONTACTS_REQUESTS_PER_DAY - (await this.sentToday(userId, now)),
      ),
    };
  }

  /**
   * Ответ на входящий запрос.
   *
   * Отказ сам по себе НИКОГО НЕ СКРЫВАЕТ — это принципиальное отличие от
   * отказа в Union, где скрытие ставится автоматически. Отказ дать телефон
   * и желание исчезнуть из справочника — разные вещи: человек может вести
   * служение и просто не раздавать номер каждому. Скрытие включается только
   * явной галочкой `hideFromRequester`. Не «чинить» на автоматику.
   */
  async respond(
    userId: string,
    requestId: string,
    body: ContactsRespondBody,
    now: Date = new Date(),
  ): Promise<ContactsRequestsState> {
    const request = await this.prisma.contactsRequest.findUnique({
      where: { id: requestId },
      select: { id: true, fromUserId: true, toUserId: true, status: true },
    });
    // Чужой запрос — 404, а не 403: подтверждать существование чужой переписки
    // незачем, id всё равно неугадываем.
    if (!request || request.toUserId !== userId) {
      throw new NotFoundException('Запрос не найден');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('На этот запрос уже отвечено');
    }
    if (typeof body?.accept !== 'boolean') {
      throw new BadRequestException('Укажите решение по запросу');
    }

    if (body.accept) {
      await this.prisma.$transaction(async (tx) => {
        await tx.contactsRequest.update({
          where: { id: request.id },
          data: { status: 'accepted', respondedAt: now },
        });
        // Пара владелец+зритель уникальна: если раскрытие уже было и его
        // отозвали, снимаем revokedAt у той же строки, а не заводим вторую —
        // журнал должен оставаться историей, а не списком дублей.
        await tx.contactsDisclosure.upsert({
          where: {
            ownerId_viewerId: { ownerId: userId, viewerId: request.fromUserId },
          },
          create: {
            ownerId: userId,
            viewerId: request.fromUserId,
            requestId: request.id,
            grantedAt: now,
          },
          update: { requestId: request.id, grantedAt: now, revokedAt: null },
        });
      });

      // Событие несёт всё, что нужно подписчику: он не имеет права дочитывать
      // недостающее из таблиц справочника. Формулировку собирает он же.
      this.emit({
        name: 'contacts.request.accepted',
        recipientId: request.fromUserId,
        senderName: await this.displayName(userId),
        ownerUserId: userId,
      });
      return this.list(userId, now);
    }

    // Скрытие ставится ДО смены статуса, как в Union: упавшее скрытие
    // оставляет запрос `pending`, и отказ можно повторить. Обратный порядок
    // дал бы отказ без обещанной защиты.
    if (body.hideFromRequester === true) {
      await this.moderation.hideFrom({
        ownerId: userId,
        viewerId: request.fromUserId,
        source: 'manual',
        scope: 'contacts',
      });
    }
    await this.prisma.contactsRequest.update({
      where: { id: request.id },
      data: { status: 'declined', respondedAt: now },
    });

    return this.list(userId, now);
  }

  /** Отправитель отзывает свой ещё не рассмотренный запрос. */
  async cancel(
    userId: string,
    requestId: string,
    now: Date = new Date(),
  ): Promise<ContactsRequestsState> {
    const request = await this.prisma.contactsRequest.findUnique({
      where: { id: requestId },
      select: { id: true, fromUserId: true, status: true },
    });
    if (!request || request.fromUserId !== userId) {
      throw new NotFoundException('Запрос не найден');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Запрос уже рассмотрен');
    }

    await this.prisma.contactsRequest.update({
      where: { id: request.id },
      data: { status: 'cancelled', respondedAt: now },
    });
    return this.list(userId, now);
  }

  /**
   * Открыть переписку по запросу контакта.
   *
   * Доступно в обе стороны — и тому, кто попросил контакт, и тому, кто его
   * открыл, — при условии, что раскрытие сейчас действует хоть в одном
   * направлении. Своей системы чатов у «Контактов» нет, поэтому диалог
   * заводится в чате Union: доступ туда уже дан этим самым раскрытием.
   */
  async openChat(
    userId: string,
    requestId: string,
  ): Promise<ContactsOpenChatResponse> {
    const request = await this.prisma.contactsRequest.findUnique({
      where: { id: requestId },
      select: { id: true, fromUserId: true, toUserId: true },
    });
    if (!request || (request.fromUserId !== userId && request.toUserId !== userId)) {
      throw new NotFoundException('Запрос не найден');
    }
    const otherUserId =
      request.fromUserId === userId ? request.toUserId : request.fromUserId;

    const disclosure = await this.prisma.contactsDisclosure.findFirst({
      where: {
        revokedAt: null,
        OR: [
          { ownerId: userId, viewerId: otherUserId },
          { ownerId: otherUserId, viewerId: userId },
        ],
      },
      select: { id: true },
    });
    if (!disclosure) {
      throw new BadRequestException(
        'Переписка доступна только при открытых контактах',
      );
    }

    return this.unionChat.openDirectChat(userId, otherUserId);
  }

  /** Журнал: кому я открыл контакты. Отозванные остаются с датой отзыва. */
  async listDisclosures(userId: string): Promise<ContactsDisclosuresState> {
    const rows = await this.prisma.contactsDisclosure.findMany({
      where: { ownerId: userId },
      include: { viewer: { select: PARTY_SELECT } },
      orderBy: { grantedAt: 'desc' },
    });

    const items: ContactsDisclosureDto[] = [];
    for (const row of rows) {
      items.push({
        id: row.id,
        user: await this.toParty(row.viewer),
        grantedAt: row.grantedAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
      });
    }
    return { items };
  }

  /**
   * Отзыв доступа. Строка не удаляется: журнал должен показывать, что доступ
   * был и когда закрыт. Повторный отзыв идемпотентен — дату первого отзыва
   * он не переписывает.
   */
  async revokeDisclosure(
    userId: string,
    disclosureId: string,
    now: Date = new Date(),
  ): Promise<ContactsDisclosuresState> {
    const disclosure = await this.prisma.contactsDisclosure.findUnique({
      where: { id: disclosureId },
      select: { id: true, ownerId: true, revokedAt: true },
    });
    if (!disclosure || disclosure.ownerId !== userId) {
      throw new NotFoundException('Раскрытие не найдено');
    }
    if (!disclosure.revokedAt) {
      await this.prisma.contactsDisclosure.update({
        where: { id: disclosure.id },
        data: { revokedAt: now },
      });
    }
    return this.listDisclosures(userId);
  }

  /** Суточный лимит отправленных запросов — мера против скрапинга справочника. */
  private async ensureUnderDailyLimit(
    userId: string,
    now: Date,
  ): Promise<void> {
    if ((await this.sentToday(userId, now)) >= CONTACTS_REQUESTS_PER_DAY) {
      throw new BadRequestException(
        `Больше ${CONTACTS_REQUESTS_PER_DAY} запросов контакта в сутки отправить нельзя. Попробуйте завтра`,
      );
    }
  }

  /** Скользящее окно в 24 часа, а не календарные сутки: обходится сложнее. */
  private sentToday(userId: string, now: Date): Promise<number> {
    return this.prisma.contactsRequest.count({
      where: {
        fromUserId: userId,
        createdAt: { gte: new Date(now.getTime() - DAY_MS) },
      },
    });
  }

  /** Владельцы, чьи контакты сейчас открыты мне: ownerId → способы связи. */
  private async openToMe(
    viewerId: string,
  ): Promise<Map<string, ContactsDetails>> {
    const rows = await this.prisma.contactsDisclosure.findMany({
      where: { viewerId, revokedAt: null },
      include: {
        owner: { select: { id: true, socialLinks: true, messengers: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.owner.id,
        {
          socialLinks: (row.owner.socialLinks ??
            {}) as ContactsDetails['socialLinks'],
          messengers: (row.owner.messengers ??
            {}) as ContactsDetails['messengers'],
        },
      ]),
    );
  }

  /**
   * Событие уведомления. Payload самодостаточен: подписчик не имеет права
   * дочитывать недостающее из таблиц справочника, а формулировку собирает сам.
   */
  private emit(event: NotificationEvent): void {
    this.events.emit(event.name, event);
  }

  /** Имя для уведомления. Пустое — не повод ронять запрос. */
  private async displayName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? 'Участник';
  }

  private async isVerified(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { spiritualStage: true, devoteeVerificationStatus: true },
    });
    return user ? isVerifiedDevotee(user) : false;
  }

  private async toRequestDto(
    row: RequestRow,
    direction: 'incoming' | 'outgoing',
    other: PartyRow,
    contacts: ContactsDetails | null,
  ): Promise<ContactsRequestDto> {
    return {
      id: row.id,
      direction,
      status: row.status,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
      user: await this.toParty(other),
      contacts,
    };
  }

  private async toParty(party: PartyRow): Promise<ContactsRequestUser> {
    const location = (party.homeLocation as ProfileLocation | null) ?? null;
    return {
      userId: party.id,
      name: party.name,
      headline: party.contactsProfile?.headline ?? null,
      // Аватар может лежать в приватном бакете — ссылку подписывает users.
      avatarUrl: await this.users.resolveAvatarUrl(party),
      city: location?.city ?? null,
    };
  }

  private requireId(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException('Укажите получателя запроса');
    }
    return value.trim();
  }

  private message(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('Сообщение: ожидается строка');
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Сообщение: не длиннее ${MAX_MESSAGE_LENGTH} символов`,
      );
    }
    return trimmed === '' ? null : trimmed;
  }
}
