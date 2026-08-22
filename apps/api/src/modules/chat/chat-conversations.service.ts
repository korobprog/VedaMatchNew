import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  ChatChannelCommunitiesState,
  ChatConversationDetail,
  ChatDiscoverState,
  ChatListState,
  ChatMapState,
  ChatRequestsState,
  ChatRequestSummary,
  ChatSearchState,
  ChatUnreadState,
  CreateChatConversationRequest,
} from '@vedamatch/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  canPinMessage,
  canRead,
  denyJoin,
  denyRemoveMember,
  denySetRole,
  type MemberDenial,
} from './chat-access';
import {
  toConversationSummary,
  toMemberDto,
  toMessageDto,
  toUserSummary,
  type ChatConversationRow,
  type ChatMessageRow,
} from './chat-dto';
import { ChatEventsService } from './chat-events.service';
import {
  chatConversationInclude,
  chatMessageInclude,
  chatUserSelect,
} from './chat-selects';
import { directKey } from './direct-key';

/** Сколько сообщений отдаём одной страницей переписки. */
const PAGE_SIZE = 40;

/** Сколько находок показываем: длинный список поиска всё равно не читают. */
const SEARCH_LIMIT = 30;

@Injectable()
export class ChatConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEventsService,
    private readonly bus: EventEmitter2,
  ) {}

  /** Список бесед: активные диалоги, группы и каналы. Запросы — отдельно. */
  async list(userId: string): Promise<ChatListState> {
    const rows = await this.prisma.chatConversation.findMany({
      where: {
        state: { in: ['active', 'archived'] },
        members: { some: { userId, leftAt: null } },
      },
      include: chatConversationInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const conversations = await Promise.all(
      rows.map(async (row) => this.summary(row, userId)),
    );
    // Закреплённое человеком — вверху списка; порядок внутри групп прежний.
    conversations.sort((a, b) => Number(b.pinned) - Number(a.pinned));

    const requestsCount = await this.prisma.chatConversation.count({
      where: {
        state: 'request',
        requestedById: { not: userId },
        members: { some: { userId, leftAt: null } },
      },
    });

    return { conversations, requestsCount };
  }

  /**
   * Сколько непрочитанного во всём сервисе. Отдельный лёгкий запрос: значок
   * на плитке главной не должен тянуть список бесед целиком.
   */
  async unread(userId: string): Promise<ChatUnreadState> {
    const memberships = await this.prisma.chatMember.findMany({
      where: {
        userId,
        leftAt: null,
        conversation: { state: { in: ['active', 'archived'] } },
      },
      select: { conversationId: true, lastReadAt: true },
    });

    let messages = 0;
    let conversations = 0;
    for (const membership of memberships) {
      const count = await this.prisma.chatMessage.count({
        where: {
          conversationId: membership.conversationId,
          authorId: { not: userId },
          deletedAt: null,
          ...(membership.lastReadAt
            ? { createdAt: { gt: membership.lastReadAt } }
            : {}),
        },
      });
      if (count > 0) {
        messages += count;
        conversations += 1;
      }
    }

    const requests = await this.prisma.chatConversation.count({
      where: {
        state: 'request',
        requestedById: { not: userId },
        members: { some: { userId, leftAt: null } },
      },
    });

    return { messages, conversations, requests };
  }

  /** Запросы на переписку: первое сообщение от незнакомого человека. */
  async requests(userId: string): Promise<ChatRequestsState> {
    const rows = await this.prisma.chatConversation.findMany({
      where: {
        state: 'request',
        requestedById: { not: userId },
        members: { some: { userId, leftAt: null } },
      },
      include: chatConversationInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const requests = await Promise.all(
      rows.map(async (row): Promise<ChatRequestSummary> => {
        const message = await this.prisma.chatMessage.findFirst({
          where: { conversationId: row.id },
          include: chatMessageInclude,
          orderBy: { createdAt: 'asc' },
        });
        const fromRow = row.members.find((m) => m.userId !== userId);
        // Профиль без фото и без общин показывается свёрнутым: столько же
        // усилий на создание, сколько у спамера, и столько же доверия.
        const communities = fromRow
          ? await this.prisma.communityMember.count({
              where: { userId: fromRow.userId, status: 'active' },
            })
          : 0;

        return {
          conversation: await this.summary(row, userId),
          from: fromRow
            ? toUserSummary(fromRow.user)
            : { id: 'unknown', name: 'Профиль удалён', avatarUrl: null },
          message: message ? toMessageDto(message, userId) : null,
          createdAt: row.createdAt.toISOString(),
          lowTrust: !fromRow?.user.avatarUrl && communities === 0,
        };
      }),
    );

    return { requests };
  }

  /**
   * Поиск по своим перепискам. Ищем только в беседах, где человек состоит:
   * иначе поиск превращается в способ вычитать чужое по обрывку фразы.
   */
  async search(userId: string, query: string): Promise<ChatSearchState> {
    const needle = query.trim();
    // Один-два символа находят половину переписки и ничего не проясняют.
    if (needle.length < 3) return { hits: [], truncated: false };

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        body: { contains: needle, mode: 'insensitive' },
        conversation: { members: { some: { userId, leftAt: null } } },
      },
      include: {
        ...chatMessageInclude,
        conversation: { include: chatConversationInclude },
      },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_LIMIT + 1,
    });

    const truncated = rows.length > SEARCH_LIMIT;
    const hits = await Promise.all(
      rows.slice(0, SEARCH_LIMIT).map(async (row) => ({
        message: toMessageDto(row as unknown as ChatMessageRow, userId),
        conversation: await this.summary(
          row.conversation as ChatConversationRow,
          userId,
        ),
      })),
    );

    return { hits, truncated };
  }

  /** Переписка с последней страницей сообщений. */
  async detail(
    userId: string,
    conversationId: string,
    before?: string,
  ): Promise<ChatConversationDetail> {
    const row = await this.requireConversation(conversationId, userId);
    const mine = row.members.find((m) => m.userId === userId);

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: chatMessageInclude,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
    });
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE).reverse();

    const othersLastReadAt = this.othersLastReadAt(row, userId);
    const messageCount = await this.prisma.chatMessage.count({
      where: { conversationId },
    });

    const summary = await this.summary(row, userId, messageCount);

    return {
      ...summary,
      description: row.description,
      pinnedMessage: row.pinnedMessage
        ? toMessageDto(row.pinnedMessage, userId)
        : null,
      members: row.members.map(toMemberDto),
      messages: page.map((message) =>
        toMessageDto(message as ChatMessageRow, userId, othersLastReadAt),
      ),
      hasMore,
      myRole: mine?.role ?? 'member',
    };
  }

  /**
   * Создание беседы. Личный диалог заводится один на пару — уникальность
   * держит `directKey` в базе, а не проверка перед вставкой.
   */
  async create(userId: string, dto: CreateChatConversationRequest) {
    if (dto.kind === 'direct') return this.createDirect(userId, dto.userId);
    if (dto.kind === 'group') return this.createGroup(userId, dto);
    return this.createChannel(userId, dto);
  }

  private async createDirect(userId: string, targetId?: string) {
    if (!targetId) throw new BadRequestException('Не указан собеседник');
    if (targetId === userId)
      throw new BadRequestException('Нельзя написать самому себе');

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, accountStatus: true },
    });
    if (!target || target.accountStatus !== 'active')
      throw new NotFoundException('Человек не найден');

    // Блокировка в любую сторону закрывает переписку целиком: и создание,
    // и последующую отправку.
    const blocked = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetId },
          { blockerId: targetId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (blocked) throw new ForbiddenException('Переписка недоступна');

    const key = directKey(userId, targetId);
    const existing = await this.prisma.chatConversation.findUnique({
      where: { directKey: key },
      include: chatConversationInclude,
    });
    if (existing) {
      if (existing.state === 'declined' && existing.requestedById === userId)
        throw new ForbiddenException('Человек отклонил переписку');
      return this.summary(existing, userId);
    }

    const created = await this.prisma.chatConversation.create({
      data: {
        kind: 'direct',
        // Новый диалог всегда начинается запросом: одно сообщение, без
        // отметки о прочтении, пока собеседник не ответит.
        state: 'request',
        directKey: key,
        createdById: userId,
        requestedById: userId,
        members: {
          create: [{ userId }, { userId: targetId }],
        },
      },
      include: chatConversationInclude,
    });

    return this.summary(created, userId);
  }

  private async createGroup(
    userId: string,
    dto: CreateChatConversationRequest,
  ) {
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('У группы должно быть название');

    const memberIds = await this.reachableUserIds(userId, dto.memberIds ?? []);

    const created = await this.prisma.chatConversation.create({
      data: {
        kind: 'group',
        state: 'active',
        visibility: dto.visibility === 'public' ? 'public' : 'private',
        title,
        description: dto.description?.trim() || null,
        createdById: userId,
        members: {
          create: [
            { userId, role: 'owner' },
            ...memberIds.map((id) => ({ userId: id })),
          ],
        },
      },
      include: chatConversationInclude,
    });

    const summary = await this.summary(created, userId);
    this.events.publish(
      created.members.map((m) => m.userId),
      { type: 'conversation.upserted', conversation: summary },
    );
    return summary;
  }

  private async createChannel(
    userId: string,
    dto: CreateChatConversationRequest,
  ) {
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('У канала должно быть название');
    if (!dto.communityId)
      throw new BadRequestException('Канал заводится в общине');

    // Право на канал даёт роль в общине: `Community` и `CommunityMember` —
    // портальные модели, читать их модулю разрешено.
    const membership = await this.prisma.communityMember.findFirst({
      where: {
        communityId: dto.communityId,
        userId,
        status: 'active',
        role: { in: ['owner', 'admin'] },
      },
      select: { id: true },
    });
    if (!membership)
      throw new ForbiddenException('Канал заводит администрация общины');

    const created = await this.prisma.chatConversation.create({
      data: {
        kind: 'channel',
        // Канал общины по смыслу витрина: если не сказано иное, он открыт.
        visibility: dto.visibility === 'private' ? 'private' : 'public',
        state: 'active',
        title,
        description: dto.description?.trim() || null,
        communityId: dto.communityId,
        createdById: userId,
        members: { create: [{ userId, role: 'owner' }] },
      },
      include: chatConversationInclude,
    });

    return this.summary(created, userId);
  }

  /** Принять запрос: диалог становится обычным. */
  async accept(userId: string, conversationId: string) {
    const row = await this.requireConversation(conversationId, userId);
    if (row.state !== 'request') throw new BadRequestException('Это не запрос');
    if (row.requestedById === userId)
      throw new ForbiddenException('Свой запрос принимает собеседник');

    const updated = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { state: 'active' },
      include: chatConversationInclude,
    });

    const summary = await this.summary(updated, userId);
    this.events.publish(
      updated.members.map((m) => m.userId),
      { type: 'conversation.upserted', conversation: summary },
    );
    return summary;
  }

  /** Отклонить: автор запроса больше не пишет и повторно не пробует. */
  async decline(userId: string, conversationId: string) {
    const row = await this.requireConversation(conversationId, userId);
    if (row.state !== 'request') throw new BadRequestException('Это не запрос');
    if (row.requestedById === userId)
      throw new ForbiddenException('Свой запрос отклоняет собеседник');

    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { state: 'declined' },
    });
    return { ok: true };
  }

  /**
   * Закрепить сообщение или снять закрепление (`messageId = null`).
   * Закреплённое одно на беседу: второе вытесняет первое — иначе шапка
   * превращается в ленту и перестаёт читаться.
   */
  async pinMessage(
    userId: string,
    conversationId: string,
    messageId: string | null,
  ) {
    const row = await this.requireConversation(conversationId, userId);
    const mine = row.members.find((m) => m.userId === userId);
    if (
      !canPinMessage(
        { kind: row.kind, state: row.state },
        mine
          ? { userId: mine.userId, role: mine.role, leftAt: mine.leftAt }
          : null,
      )
    )
      throw new ForbiddenException('Закрепляет владелец беседы');

    if (messageId) {
      const message = await this.prisma.chatMessage.findFirst({
        where: { id: messageId, conversationId, deletedAt: null },
        select: { id: true },
      });
      if (!message) throw new NotFoundException('Сообщение не найдено');
    }

    const updated = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { pinnedMessageId: messageId },
      include: chatConversationInclude,
    });

    const pinned = updated.pinnedMessage
      ? toMessageDto(updated.pinnedMessage, userId)
      : null;
    this.events.publish(this.recipients(updated), {
      type: 'pinned',
      conversationId,
      message: pinned,
    });
    return { pinnedMessage: pinned };
  }

  /** Отметка прочтения — по ней же считается галочка у собеседника. */
  async markRead(userId: string, conversationId: string) {
    const row = await this.requireConversation(conversationId, userId);
    const lastReadAt = new Date();
    await this.prisma.chatMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt },
    });

    this.events.publish(
      row.members.map((m) => m.userId),
      {
        type: 'read',
        conversationId,
        userId,
        lastReadAt: lastReadAt.toISOString(),
      },
    );
    return { lastReadAt: lastReadAt.toISOString() };
  }

  /** «Печатает…»: живёт только в потоке, в базу не пишется. */
  async typing(userId: string, conversationId: string) {
    const row = await this.requireConversation(conversationId, userId);
    const mine = row.members.find((m) => m.userId === userId);
    if (!mine) return { ok: true };

    this.events.publish(
      row.members.filter((m) => m.userId !== userId).map((m) => m.userId),
      {
        type: 'typing',
        conversationId,
        user: toUserSummary(mine.user),
      },
    );
    return { ok: true };
  }

  async setMuted(userId: string, conversationId: string, muted: boolean) {
    await this.requireConversation(conversationId, userId);
    // Беззвучный режим без срока — на сто лет вперёд: отдельный флаг рядом
    // с датой пришлось бы держать в согласии, а это лишний источник расхождений.
    const mutedUntil = muted
      ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
      : null;
    await this.prisma.chatMember.updateMany({
      where: { conversationId, userId },
      data: { mutedUntil },
    });
    return { muted };
  }

  async setPinned(userId: string, conversationId: string, pinned: boolean) {
    await this.requireConversation(conversationId, userId);
    await this.prisma.chatMember.updateMany({
      where: { conversationId, userId },
      data: { pinnedAt: pinned ? new Date() : null },
    });
    return { pinned };
  }

  /** Выйти из группы или убрать диалог из списка. */
  async leave(userId: string, conversationId: string) {
    await this.requireConversation(conversationId, userId);
    await this.prisma.chatMember.updateMany({
      where: { conversationId, userId },
      data: { leftAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Войти в открытую беседу самому: подписаться на канал общины или
   * вступить в открытую группу. Закрытая отвечает «не найдено», а не
   * «нельзя»: иначе перебором id узнаётся, что она существует.
   */
  async subscribe(userId: string, conversationId: string) {
    const row = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: chatConversationInclude,
    });
    if (!row) throw new NotFoundException('Беседа не найдена');

    const denial = denyJoin({
      kind: row.kind,
      state: row.state,
      visibility: row.visibility,
    });
    if (denial) {
      const alreadyIn = row.members.some(
        (member) => member.userId === userId && !member.leftAt,
      );
      // Участнику закрытой беседы честнее сказать, что он уже внутри.
      if (alreadyIn) return { ok: true };
      throw new NotFoundException('Беседа не найдена');
    }

    await this.prisma.chatMember.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId },
      update: { leftAt: null },
    });
    return { ok: true };
  }

  /**
   * Карта общин: точки, по которым можно ходить и подписываться на их
   * открытые беседы. `Community` — портальная модель, читать её модулю
   * разрешено; людей на карту не выводим осознанно (см. ChatMapCommunity).
   */
  async map(): Promise<ChatMapState> {
    const rows = await this.prisma.community.findMany({
      where: { status: 'active', location: { not: Prisma.DbNull } },
      select: { id: true, slug: true, name: true, city: true, location: true },
      take: 500,
    });

    const ids = rows.map((row) => row.id);
    const conversations = ids.length
      ? await this.prisma.chatConversation.findMany({
          where: {
            communityId: { in: ids },
            visibility: 'public',
            state: 'active',
          },
          select: { communityId: true, kind: true },
        })
      : [];

    const communities = rows
      .map((row) => {
        // Координаты лежат в ProfileLocation целиком; община без них на
        // карту не попадает — точка «где-то в океане» хуже её отсутствия.
        const location = row.location as { lat?: number; lon?: number } | null;
        if (
          typeof location?.lat !== 'number' ||
          typeof location?.lon !== 'number'
        )
          return null;

        const mine = conversations.filter(
          (conversation) => conversation.communityId === row.id,
        );
        return {
          community: { id: row.id, slug: row.slug, name: row.name },
          lat: location.lat,
          lon: location.lon,
          city: row.city,
          channels: mine.filter((c) => c.kind === 'channel').length,
          groups: mine.filter((c) => c.kind === 'group').length,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return { communities };
  }

  /**
   * Каталог открытых бесед: то, на что можно подписаться самому. Это
   * витрина портала, а не список «где я состою», поэтому беседы, куда
   * человек уже вошёл, из неё не выпадают — они помечены.
   */
  async discover(
    userId: string,
    query?: string,
    communityId?: string,
  ): Promise<ChatDiscoverState> {
    const needle = query?.trim();
    const rows = await this.prisma.chatConversation.findMany({
      where: {
        visibility: 'public',
        state: 'active',
        kind: { in: ['group', 'channel'] },
        ...(communityId ? { communityId } : {}),
        ...(needle
          ? {
              OR: [
                { title: { contains: needle, mode: 'insensitive' } },
                { description: { contains: needle, mode: 'insensitive' } },
                {
                  community: {
                    name: { contains: needle, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      include: chatConversationInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    const items = await Promise.all(
      rows.map(async (row) => ({
        conversation: await this.summary(row, userId),
        joined: row.members.some(
          (member) => member.userId === userId && !member.leftAt,
        ),
      })),
    );
    return { items };
  }

  /** Позвать людей в группу или дать им канал. */
  async addMembers(userId: string, conversationId: string, userIds: string[]) {
    const row = await this.requireConversation(conversationId, userId);
    const mine = row.members.find((m) => m.userId === userId);
    if (row.kind === 'direct')
      throw new BadRequestException('В личный диалог никого не добавляют');
    if (!mine || (mine.role !== 'owner' && mine.role !== 'admin'))
      throw new ForbiddenException('Приглашает владелец или администратор');

    const reachable = await this.reachableUserIds(userId, userIds);
    for (const id of reachable)
      await this.prisma.chatMember.upsert({
        where: { conversationId_userId: { conversationId, userId: id } },
        create: { conversationId, userId: id },
        update: { leftAt: null },
      });

    return { added: reachable.length };
  }

  /** Убрать человека из группы или канала. */
  async removeMember(userId: string, conversationId: string, targetId: string) {
    const row = await this.requireConversation(conversationId, userId);
    const actor = row.members.find((m) => m.userId === userId);
    const target = row.members.find((m) => m.userId === targetId);
    if (!target) throw new NotFoundException('Участник не найден');

    this.assertMemberAction(
      denyRemoveMember(
        { kind: row.kind, state: row.state },
        actor && {
          userId: actor.userId,
          role: actor.role,
          leftAt: actor.leftAt,
        },
        { userId: target.userId, role: target.role, leftAt: target.leftAt },
      ),
    );

    await this.prisma.chatMember.updateMany({
      where: { conversationId, userId: targetId },
      data: { leftAt: new Date() },
    });
    return { ok: true };
  }

  /** Назначить администратора или снять права. */
  async setMemberRole(
    userId: string,
    conversationId: string,
    targetId: string,
    role: 'admin' | 'member',
  ) {
    const row = await this.requireConversation(conversationId, userId);
    const actor = row.members.find((m) => m.userId === userId);
    const target = row.members.find((m) => m.userId === targetId);
    if (!target) throw new NotFoundException('Участник не найден');

    this.assertMemberAction(
      denySetRole(
        { kind: row.kind, state: row.state },
        actor && {
          userId: actor.userId,
          role: actor.role,
          leftAt: actor.leftAt,
        },
        { userId: target.userId, role: target.role, leftAt: target.leftAt },
      ),
    );

    await this.prisma.chatMember.updateMany({
      where: { conversationId, userId: targetId },
      data: { role },
    });
    return { role };
  }

  /** Переименовать беседу и поправить описание. */
  async updateConversation(
    userId: string,
    conversationId: string,
    patch: {
      title?: string;
      description?: string;
      avatarUrl?: string;
      avatarKey?: string;
      visibility?: 'public' | 'private';
    },
  ) {
    const row = await this.requireConversation(conversationId, userId);
    const mine = row.members.find((m) => m.userId === userId);
    if (row.kind === 'direct')
      throw new BadRequestException('У личного диалога нет названия');
    if (!mine || (mine.role !== 'owner' && mine.role !== 'admin'))
      throw new ForbiddenException('Меняет владелец или администратор');

    const title = patch.title?.trim();
    if (title !== undefined && !title)
      throw new BadRequestException('Название не может быть пустым');

    const updated = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        ...(title ? { title: title.slice(0, 80) } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description.trim().slice(0, 300) || null }
          : {}),
        ...(patch.avatarUrl
          ? { avatarUrl: patch.avatarUrl, avatarKey: patch.avatarKey ?? null }
          : {}),
        ...(patch.visibility ? { visibility: patch.visibility } : {}),
      },
      include: chatConversationInclude,
    });

    const summary = await this.summary(updated, userId);
    this.events.publish(this.recipients(updated), {
      type: 'conversation.upserted',
      conversation: summary,
    });
    return summary;
  }

  /** Отказы правил — человеку, а не в логи. */
  private assertMemberAction(denial: MemberDenial | null) {
    if (!denial) return;
    if (denial === 'direct_has_no_roles')
      throw new BadRequestException('В личном диалоге ролей нет');
    if (denial === 'owner_is_untouchable')
      throw new ForbiddenException('Владельца беседы менять нельзя');
    if (denial === 'owner_sets_roles')
      throw new ForbiddenException('Права раздаёт владелец беседы');
    throw new ForbiddenException('Недостаточно прав');
  }

  /** Общий сборщик сводки: считает непрочитанное и тянет последнее сообщение. */
  private async summary(
    row: ChatConversationRow,
    userId: string,
    knownMessageCount?: number,
  ) {
    const mine = row.members.find((m) => m.userId === userId);
    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        conversationId: row.id,
        authorId: { not: userId },
        deletedAt: null,
        ...(mine?.lastReadAt ? { createdAt: { gt: mine.lastReadAt } } : {}),
      },
    });

    const last = await this.prisma.chatMessage.findFirst({
      where: { conversationId: row.id },
      include: chatMessageInclude,
      orderBy: { createdAt: 'desc' },
    });

    const messageCount =
      knownMessageCount ??
      (row.state === 'request'
        ? await this.prisma.chatMessage.count({
            where: { conversationId: row.id },
          })
        : undefined);

    return toConversationSummary(row, userId, {
      unreadCount,
      lastMessage: last
        ? toMessageDto(last, userId, this.othersLastReadAt(row, userId))
        : null,
      messageCount,
    });
  }

  /**
   * Когда собеседники читали в последний раз. Для личного диалога это
   * отметка одного человека, для группы — самая ранняя из чужих: галочка
   * «прочитано» в группе честна только тогда, когда прочитали все.
   */
  private othersLastReadAt(
    row: ChatConversationRow,
    userId: string,
  ): Date | null {
    const others = row.members.filter((m) => m.userId !== userId && !m.leftAt);
    if (others.length === 0) return null;
    let earliest: Date | null = null;
    for (const member of others) {
      if (!member.lastReadAt) return null;
      if (!earliest || member.lastReadAt < earliest)
        earliest = member.lastReadAt;
    }
    return earliest;
  }

  /** Беседа с проверкой доступа: посторонний не должен даже узнать, что она есть. */
  async requireConversation(
    conversationId: string,
    userId: string,
  ): Promise<ChatConversationRow> {
    const row = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: chatConversationInclude,
    });
    if (!row) throw new NotFoundException('Беседа не найдена');
    const mine = row.members.find((m) => m.userId === userId);
    if (!canRead(mine)) throw new NotFoundException('Беседа не найдена');
    return row;
  }

  /**
   * Кого можно звать: живые аккаунты без взаимной блокировки. Молча
   * отбрасываем недоступных, а не падаем: приглашение десяти человек не
   * должно срываться из-за одного удалённого профиля.
   */
  private async reachableUserIds(
    userId: string,
    candidates: string[],
  ): Promise<string[]> {
    const ids = [...new Set(candidates)].filter((id) => id !== userId);
    if (ids.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, accountStatus: 'active' },
      select: { id: true },
    });
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: ids } },
          { blockedId: userId, blockerId: { in: ids } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    const blocked = new Set(
      blocks
        .flatMap((b) => [b.blockerId, b.blockedId])
        .filter((id) => id !== userId),
    );
    return users.map((u) => u.id).filter((id) => !blocked.has(id));
  }

  /**
   * С кем можно собрать группу: люди из активных личных диалогов. Не
   * справочник портала и не поиск по всем — приглашать в беседу того, с кем
   * ещё ни разу не говорил, значит открыть новую дверь для спама.
   */
  async people(userId: string) {
    const rows = await this.prisma.chatConversation.findMany({
      where: {
        kind: 'direct',
        state: 'active',
        members: { some: { userId, leftAt: null } },
      },
      include: { members: { include: { user: { select: chatUserSelect } } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });

    const seen = new Set<string>();
    const people: ReturnType<typeof toUserSummary>[] = [];
    for (const row of rows) {
      const other = row.members.find((m) => m.userId !== userId);
      if (!other || seen.has(other.userId)) continue;
      seen.add(other.userId);
      people.push(toUserSummary(other.user));
    }
    return { people };
  }

  /**
   * Общины, где человек вправе завести канал. `Community` и
   * `CommunityMember` — портальные модели, читать их модулю разрешено;
   * ничего, кроме имени и роли, отсюда не берётся.
   */
  async channelCommunities(
    userId: string,
  ): Promise<ChatChannelCommunitiesState> {
    const memberships = await this.prisma.communityMember.findMany({
      where: {
        userId,
        status: 'active',
        role: { in: ['owner', 'admin'] },
      },
      select: {
        community: { select: { id: true, slug: true, name: true } },
      },
      take: 50,
    });

    const communityIds = memberships.map((row) => row.community.id);
    const channels = communityIds.length
      ? await this.prisma.chatConversation.findMany({
          where: { kind: 'channel', communityId: { in: communityIds } },
          select: { id: true, title: true, communityId: true },
        })
      : [];

    return {
      communities: memberships.map((row) => ({
        community: row.community,
        channels: channels
          .filter((channel) => channel.communityId === row.community.id)
          .map((channel) => ({
            id: channel.id,
            title: channel.title ?? 'Канал',
          })),
      })),
    };
  }

  /** Кому доставлять событие: все, кто не выходил из беседы. */
  recipients(row: ChatConversationRow): string[] {
    return row.members.filter((m) => !m.leftAt).map((m) => m.userId);
  }
}
