import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COMMUNITY_JOIN_REQUESTS_PER_DAY,
  type CommunityMembersResponse,
  type CommunityMembershipDto,
  type CommunityTransferDto,
  type JoinCommunityRequest,
  type UpdateMemberRequest,
  type UpdateMembershipRequest,
  resolveDisplayName,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toMemberDto, toMembershipDto } from './community-dto';
import {
  canAssignRole,
  canManageCommunity,
  canReapply,
  isOwner,
  isReachable,
  joinStatusFor,
} from './community-roles';
import {
  COMMUNITY_VALIDATION_MESSAGES,
  validateMemberTitle,
} from './community-validate';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
/** Сколько дней у принимающего есть на ответ по передаче владения. */
const TRANSFER_TTL_DAYS = 14;

const MEMBER_USER_SELECT = {
  // spiritualName обязателен рядом с любым DTO наружу: имя собирает
  // resolveDisplayName, а не user.name — см. контракт модуля.
  name: true,
  spiritualName: true,
  avatarUrl: true,
  homeLocation: true,
} as const;

@Injectable()
export class CommunityMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    communityId: string,
    viewerId: string | undefined,
    query: Record<string, string | undefined>,
    viewerIsAdmin: boolean,
  ): Promise<CommunityMembersResponse> {
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      select: { status: true, createdById: true },
    });
    if (!community) throw new NotFoundException('Община не найдена');

    const viewer = viewerId
      ? await this.membership(communityId, viewerId)
      : null;
    const manages = canManageCommunity(viewer);
    // Та же видимость, что в bySlug(): владелец и админ портала должны
    // видеть карточку целиком, включая список из одного себя, пока она
    // ждёт проверки — иначе страница вновь созданной общины разваливается
    // ровно в момент, когда автор в неё заходит. Было расхождением: bySlug
    // пускал создателя, а list() проверял только isReachable(status) и
    // отдавал 404 на карточку, которую сам же bySlug только что показал.
    const mayLook =
      isReachable(community.status) ||
      viewerIsAdmin ||
      community.createdById === viewerId ||
      manages;
    if (!mayLook) throw new NotFoundException('Община не найдена');
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    );
    // Заявки видны только тем, кто их разбирает; скрытые участники — тоже:
    // «я состою, но не афиширую» обязано работать и в списке участников.
    const where: Prisma.CommunityMemberWhereInput = manages
      ? { communityId, status: { in: ['active', 'pending'] } }
      : { communityId, status: 'active', isPublic: true };

    const [rows, total] = await Promise.all([
      this.prisma.communityMember.findMany({
        where,
        include: { user: { select: MEMBER_USER_SELECT } },
        orderBy: [
          { status: 'asc' },
          { role: 'asc' },
          { joinedAt: 'asc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.communityMember.count({ where }),
    ]);
    return { items: rows.map(toMemberDto), page, pageSize, total };
  }

  async join(
    userId: string,
    communityId: string,
    body: JoinCommunityRequest,
  ): Promise<CommunityMembershipDto> {
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      select: { status: true, joinPolicy: true },
    });
    if (!community || community.status !== 'active')
      throw new NotFoundException('Община не найдена');

    const status = joinStatusFor(community.joinPolicy);
    if (!status)
      throw new ForbiddenException('В эту общину вступают по приглашению');

    const existing = await this.membershipRow(communityId, userId);
    if (!canReapply(existing, new Date()))
      throw new BadRequestException(
        existing?.status === 'active'
          ? 'Вы уже в этой общине'
          : 'Повторную заявку пока подать нельзя',
      );

    await this.assertJoinRateLimit(userId);

    const data = {
      role: 'member' as const,
      status,
      joinedAt: status === 'active' ? new Date() : null,
      decidedById: null,
      decidedAt: null,
    };
    const member = existing
      ? await this.prisma.communityMember.update({
          where: { communityId_userId: { communityId, userId } },
          data,
        })
      : await this.prisma.communityMember.create({
          data: { communityId, userId, ...data },
        });
    if (status === 'active') {
      await this.recountMembers(communityId);
      await this.ensurePrimary(userId, communityId);
    }
    // Сопроводительное сообщение к заявке пока не хранится: показывать его
    // негде, а колонка «на будущее» через год окажется пустой у всех.
    void body.message;
    return toMembershipDto(member);
  }

  async leave(userId: string, communityId: string): Promise<void> {
    const membership = await this.membershipRow(communityId, userId);
    if (!membership || membership.status !== 'active')
      throw new NotFoundException('Вы не состоите в этой общине');
    if (membership.role === 'owner')
      throw new BadRequestException(
        'Сначала передайте владение — община не может остаться без владельца',
      );
    await this.prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId } },
      data: { status: 'left', isPrimary: false, decidedAt: new Date() },
    });
    await this.recountMembers(communityId);
  }

  /** Ответ админа общины на заявку. */
  async respond(
    actorId: string,
    communityId: string,
    targetUserId: string,
    accept: boolean,
  ): Promise<CommunityMembershipDto> {
    await this.assertManages(communityId, actorId);
    const target = await this.membershipRow(communityId, targetUserId);
    if (!target || target.status !== 'pending')
      throw new NotFoundException('Заявка не найдена');
    const member = await this.prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId: targetUserId } },
      data: {
        status: accept ? 'active' : 'declined',
        joinedAt: accept ? new Date() : null,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    if (accept) {
      await this.recountMembers(communityId);
      await this.ensurePrimary(targetUserId, communityId);
    }
    return toMembershipDto(member);
  }

  async remove(
    actorId: string,
    communityId: string,
    targetUserId: string,
  ): Promise<void> {
    const actor = await this.assertManages(communityId, actorId);
    const target = await this.membershipRow(communityId, targetUserId);
    if (!target) throw new NotFoundException('Участник не найден');
    if (target.role === 'owner')
      throw new ForbiddenException('Владельца исключить нельзя');
    if (target.role === 'admin' && !isOwner(actor))
      throw new ForbiddenException('Админа исключает только владелец');
    await this.prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId: targetUserId } },
      data: {
        status: 'removed',
        isPrimary: false,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    await this.recountMembers(communityId);
  }

  async setRole(
    actorId: string,
    communityId: string,
    targetUserId: string,
    body: UpdateMemberRequest,
  ): Promise<CommunityMembershipDto> {
    const actor = await this.assertManages(communityId, actorId);
    const target = await this.membershipRow(communityId, targetUserId);
    if (!target || target.status !== 'active')
      throw new NotFoundException('Участник не найден');

    const data: Prisma.CommunityMemberUpdateInput = {};
    if (body.role !== undefined) {
      if (!canAssignRole(actor, target, body.role))
        throw new ForbiddenException('Нет прав на эту роль');
      data.role = body.role;
    }
    if (body.title !== undefined) {
      const error = validateMemberTitle(body.title);
      if (error)
        throw new BadRequestException(COMMUNITY_VALIDATION_MESSAGES[error]);
      data.title = body.title?.trim() || null;
    }
    const member = await this.prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId: targetUserId } },
      data,
    });
    return toMembershipDto(member);
  }

  /** Своё членство: значок в профиле, публичность и подпись служения. */
  async updateOwn(
    userId: string,
    communityId: string,
    body: UpdateMembershipRequest,
  ): Promise<CommunityMembershipDto> {
    const membership = await this.membershipRow(communityId, userId);
    if (!membership || membership.status !== 'active')
      throw new NotFoundException('Вы не состоите в этой общине');
    if (body.title !== undefined) {
      const error = validateMemberTitle(body.title);
      if (error)
        throw new BadRequestException(COMMUNITY_VALIDATION_MESSAGES[error]);
    }

    // Основная община ровно одна: частичный уникальный индекс Prisma
    // выразить не умеет, поэтому инвариант держится транзакцией — снимаем
    // флаг с прежней и ставим на новую вместе.
    return this.prisma.$transaction(async (tx) => {
      if (body.isPrimary === true)
        await tx.communityMember.updateMany({
          where: { userId, isPrimary: true, communityId: { not: communityId } },
          data: { isPrimary: false },
        });
      const member = await tx.communityMember.update({
        where: { communityId_userId: { communityId, userId } },
        data: {
          ...(body.isPrimary !== undefined
            ? { isPrimary: body.isPrimary }
            : {}),
          ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
          ...(body.title !== undefined
            ? { title: body.title?.trim() || null }
            : {}),
        },
      });
      return toMembershipDto(member);
    });
  }

  // ===== Передача владения =====

  async createTransfer(
    actorId: string,
    communityId: string,
    toUserId: string,
  ): Promise<CommunityTransferDto> {
    const actor = await this.membershipRow(communityId, actorId);
    if (!isOwner(actor)) throw new ForbiddenException('Только владелец');
    if (toUserId === actorId)
      throw new BadRequestException('Себе передавать нечего');
    const target = await this.membershipRow(communityId, toUserId);
    if (!target || target.status !== 'active')
      throw new BadRequestException('Принимающий должен состоять в общине');

    const expiresAt = new Date(
      Date.now() + TRANSFER_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    // Непринятое предложение висит не вечно: забытая передача владения —
    // это мина, которая срабатывает через год.
    await this.prisma.communityOwnershipTransfer.updateMany({
      where: { communityId, acceptedAt: null, declinedAt: null },
      data: { declinedAt: new Date() },
    });
    const transfer = await this.prisma.communityOwnershipTransfer.create({
      data: { communityId, fromUserId: actorId, toUserId, expiresAt },
      include: this.transferInclude,
    });
    return this.toTransferDto(transfer);
  }

  async listIncomingTransfers(userId: string): Promise<CommunityTransferDto[]> {
    const rows = await this.prisma.communityOwnershipTransfer.findMany({
      where: {
        toUserId: userId,
        acceptedAt: null,
        declinedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: this.transferInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toTransferDto(row));
  }

  async respondToTransfer(
    userId: string,
    transferId: string,
    accept: boolean,
  ): Promise<CommunityTransferDto> {
    const transfer = await this.prisma.communityOwnershipTransfer.findUnique({
      where: { id: transferId },
      include: this.transferInclude,
    });
    if (!transfer || transfer.toUserId !== userId)
      throw new NotFoundException('Передача не найдена');
    if (transfer.acceptedAt || transfer.declinedAt)
      throw new BadRequestException('По этой передаче уже есть решение');
    if (transfer.expiresAt <= new Date())
      throw new BadRequestException('Срок предложения истёк');

    if (!accept) {
      const declined = await this.prisma.communityOwnershipTransfer.update({
        where: { id: transferId },
        data: { declinedAt: new Date() },
        include: this.transferInclude,
      });
      return this.toTransferDto(declined);
    }

    // Обе роли меняются одной транзакцией: полшага здесь оставили бы
    // общину либо с двумя владельцами, либо без единого.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.communityMember.update({
        where: {
          communityId_userId: {
            communityId: transfer.communityId,
            userId: transfer.fromUserId,
          },
        },
        data: { role: 'admin' },
      });
      await tx.communityMember.update({
        where: {
          communityId_userId: {
            communityId: transfer.communityId,
            userId: transfer.toUserId,
          },
        },
        data: { role: 'owner' },
      });
      return tx.communityOwnershipTransfer.update({
        where: { id: transferId },
        data: { acceptedAt: new Date() },
        include: this.transferInclude,
      });
    });
    return this.toTransferDto(updated);
  }

  // ===== Внутреннее =====

  private readonly transferInclude = {
    community: { select: { name: true } },
    fromUser: { select: { name: true, spiritualName: true } },
    toUser: { select: { name: true, spiritualName: true } },
  } as const;

  private toTransferDto(row: {
    id: string;
    communityId: string;
    createdAt: Date;
    expiresAt: Date;
    acceptedAt: Date | null;
    declinedAt: Date | null;
    community: { name: string };
    fromUser: { name: string; spiritualName: string | null };
    toUser: { name: string; spiritualName: string | null };
  }): CommunityTransferDto {
    return {
      id: row.id,
      communityId: row.communityId,
      communityName: row.community.name,
      fromUserName: resolveDisplayName(row.fromUser),
      toUserName: resolveDisplayName(row.toUser),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      declinedAt: row.declinedAt?.toISOString() ?? null,
    };
  }

  private membership(communityId: string, userId: string) {
    return this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true, status: true },
    });
  }

  private membershipRow(communityId: string, userId: string) {
    return this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
  }

  private async assertManages(communityId: string, userId: string) {
    const membership = await this.membershipRow(communityId, userId);
    if (!canManageCommunity(membership))
      throw new ForbiddenException('Нет прав в этой общине');
    return membership;
  }

  /**
   * Суточный лимит на заявки. Без него справочник общин превращается в
   * инструмент рассылки: подал заявку в сорок ятр — сорок админов получили
   * уведомление с твоим именем.
   */
  private async assertJoinRateLimit(userId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sent = await this.prisma.communityMember.count({
      where: { userId, createdAt: { gte: since } },
    });
    if (sent >= COMMUNITY_JOIN_REQUESTS_PER_DAY)
      throw new BadRequestException('Слишком много заявок за сутки');
  }

  /**
   * Первая община человека сразу становится основной. Иначе в профиле
   * значок показан (`badgeFor` берёт единственное участие независимо от
   * флага), а переключатель «основная» не отмечен ни у чего — расхождение,
   * которое видно глазами.
   */
  private async ensurePrimary(userId: string, communityId: string) {
    const hasPrimary = await this.prisma.communityMember.findFirst({
      where: { userId, isPrimary: true, status: 'active' },
      select: { id: true },
    });
    if (hasPrimary) return;
    await this.prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId } },
      data: { isPrimary: true },
    });
  }

  /**
   * Счётчик участников пересчитывается запросом, а не инкрементом: заявка,
   * выход и исключение меняют его в разные стороны, и рассинхрон
   * инкрементов виден в справочнике сразу.
   */
  private async recountMembers(communityId: string) {
    const membersCount = await this.prisma.communityMember.count({
      where: { communityId, status: 'active' },
    });
    await this.prisma.community.update({
      where: { id: communityId },
      data: { membersCount },
    });
  }
}
