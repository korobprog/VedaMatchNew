import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  resolveDisplayName,
  type CreateWorkInviteRequest,
  type WorkInviteDto,
  type WorkInvitePreviewDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createWorkInviteToken,
  hashWorkInviteToken,
  workInviteExpiry,
  workInviteState,
  workInviteStateMessage,
  workInviteUrl,
} from './work-invite';
import { WORK_EVENTS, type WorkInviteReceivedEvent } from './work-events';
import { assertWorkAccess, workRoleTitle } from './work-roles';
import { WorkSpacesService } from './work-spaces.service';
import { normalizeWorkColor } from './work-validate';

@Injectable()
export class WorkInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: WorkSpacesService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  private webUrl(): string {
    return this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
  }

  /**
   * Ссылка отдаётся целиком ровно здесь и один раз: в базе лежит хеш, и
   * повторно собрать её неоткуда. Потерявший ссылку делает новую.
   */
  async create(
    spaceId: string,
    userId: string,
    request: CreateWorkInviteRequest,
  ): Promise<WorkInviteDto> {
    assertWorkAccess(
      await this.spaces.roleOf(spaceId, userId),
      'manageMembers',
    );

    if (request.inviteeId) {
      const already = await this.spaces.roleOf(spaceId, request.inviteeId);
      if (already) throw new BadRequestException('Этот человек уже в среде');
    }

    const { token, tokenHash } = createWorkInviteToken();
    const invite = await this.prisma.workInvite.create({
      data: {
        spaceId,
        tokenHash,
        role: request.role ?? 'member',
        createdById: userId,
        inviteeId: request.inviteeId ?? null,
        // Именное приглашение — на один вход: пересылать его дальше незачем.
        maxUses: request.inviteeId ? 1 : Math.max(request.maxUses ?? 0, 0),
        expiresAt: workInviteExpiry(new Date(), request.expiresInDays),
      },
      include: {
        invitee: { select: { id: true, name: true, spiritualName: true } },
        space: { select: { name: true } },
      },
    });

    if (invite.inviteeId) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, spiritualName: true },
      });
      // Событие самодостаточно: подписчик не дочитывает наши таблицы. Ссылка
      // едет путём, а не полным адресом: колокольчик ведёт по своему домену, а
      // выносить одноразовый токен в чужую абсолютную ссылку незачем.
      this.events.emit(WORK_EVENTS.inviteReceived, {
        name: WORK_EVENTS.inviteReceived,
        recipientId: invite.inviteeId,
        spaceName: invite.space.name,
        inviterName: inviter ? resolveDisplayName(inviter) : null,
        roleTitle: workRoleTitle(invite.role),
        url: `/work/join/${token}`,
      } satisfies WorkInviteReceivedEvent);
    }

    return {
      id: invite.id,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      createdAt: invite.createdAt.toISOString(),
      invitee: invite.invitee
        ? {
            userId: invite.invitee.id,
            name: resolveDisplayName(invite.invitee),
          }
        : null,
      url: workInviteUrl(this.webUrl(), token),
    };
  }

  async list(spaceId: string, userId: string): Promise<WorkInviteDto[]> {
    assertWorkAccess(
      await this.spaces.roleOf(spaceId, userId),
      'manageMembers',
    );
    const invites = await this.prisma.workInvite.findMany({
      where: { spaceId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        invitee: { select: { id: true, name: true, spiritualName: true } },
      },
    });
    return invites.map((invite) => ({
      id: invite.id,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      createdAt: invite.createdAt.toISOString(),
      invitee: invite.invitee
        ? {
            userId: invite.invitee.id,
            name: resolveDisplayName(invite.invitee),
          }
        : null,
      // Ссылки в списке нет и быть не может: база знает только хеш.
      url: null,
    }));
  }

  async revoke(inviteId: string, userId: string): Promise<void> {
    const invite = await this.prisma.workInvite.findUnique({
      where: { id: inviteId },
      select: { spaceId: true },
    });
    if (!invite) throw new NotFoundException('Приглашение не найдено');
    assertWorkAccess(
      await this.spaces.roleOf(invite.spaceId, userId),
      'manageMembers',
    );
    await this.prisma.workInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Экран приглашения. Открыт и тому, кто ещё не вошёл на портал: человек
   * должен видеть, куда его зовут, до того как заводить аккаунт. Наружу едут
   * только название среды, роль и число участников — не содержимое досок.
   */
  async preview(
    token: string,
    userId: string | null,
  ): Promise<WorkInvitePreviewDto> {
    const invite = await this.findActive(token);
    const space = await this.prisma.workSpace.findUnique({
      where: { id: invite.spaceId },
      select: {
        name: true,
        color: true,
        _count: { select: { members: true } },
      },
    });
    if (!space) throw new NotFoundException('Рабочая среда не найдена');

    const inviter = invite.createdById
      ? await this.prisma.user.findUnique({
          where: { id: invite.createdById },
          select: { name: true, spiritualName: true },
        })
      : null;

    return {
      spaceName: space.name,
      spaceColor: normalizeWorkColor(space.color),
      role: invite.role,
      invitedBy: inviter ? resolveDisplayName(inviter) : null,
      memberCount: space._count.members,
      expiresAt: invite.expiresAt.toISOString(),
      alreadyMember: userId
        ? Boolean(await this.spaces.roleOf(invite.spaceId, userId))
        : false,
    };
  }

  /** Принять приглашение. Возвращает id среды — фронту некуда иначе вести. */
  async accept(token: string, userId: string): Promise<{ spaceId: string }> {
    const invite = await this.findActive(token);
    if (invite.inviteeId && invite.inviteeId !== userId) {
      throw new BadRequestException(
        'Это приглашение адресовано другому человеку',
      );
    }

    const already = await this.spaces.roleOf(invite.spaceId, userId);
    if (already) return { spaceId: invite.spaceId };

    await this.prisma.$transaction([
      this.prisma.workSpaceMember.create({
        data: { spaceId: invite.spaceId, userId, role: invite.role },
      }),
      this.prisma.workInvite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      }),
      this.prisma.workActivity.create({
        data: {
          spaceId: invite.spaceId,
          actorId: userId,
          kind: 'member_joined',
          payload: { role: invite.role, roleTitle: workRoleTitle(invite.role) },
        },
      }),
    ]);

    return { spaceId: invite.spaceId };
  }

  private async findActive(token: string) {
    const invite = await this.prisma.workInvite.findUnique({
      where: { tokenHash: hashWorkInviteToken(token) },
    });
    if (!invite) throw new NotFoundException('Приглашение не найдено');

    const state = workInviteState(invite, new Date());
    if (state !== 'active') {
      throw new BadRequestException(workInviteStateMessage(state));
    }
    return invite;
  }
}
