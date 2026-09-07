import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  WORK_DEFAULT_COLUMNS,
  WORK_MAX_BOARDS_PER_SPACE,
  WORK_SPACE_DESCRIPTION_MAX,
  type CreateWorkSpaceRequest,
  type UpdateWorkSpaceRequest,
  type WorkMemberRole,
  type WorkSpaceDto,
  type WorkSpaceSummaryDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WORK_POSITION_STEP } from './work-position';
import { assertWorkAccess, canAssignRole } from './work-roles';
import { toWorkLabel, toWorkMember } from './work-dto';
import {
  normalizeWorkColor,
  optionalText,
  requireSpaceName,
  workPrefixFromName,
} from './work-validate';

/** Портальный профиль — единственное, что сервису разрешено читать из чужого. */
const workUserSelect = {
  id: true,
  name: true,
  spiritualName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class WorkSpacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Роль смотрящего в среде; `null` — он здесь никто. Спрашивается перед
   * каждым действием: чужая среда обязана быть неотличима от несуществующей.
   */
  async roleOf(
    spaceId: string,
    userId: string,
  ): Promise<WorkMemberRole | null> {
    const member = await this.prisma.workSpaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async list(userId: string): Promise<WorkSpaceSummaryDto[]> {
    const memberships = await this.prisma.workSpaceMember.findMany({
      where: { userId, space: { archivedAt: null } },
      include: {
        space: {
          include: {
            _count: { select: { members: true, boards: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    // Незакрытые задачи считаем одним запросом на все среды: по запросу на
    // карточку список из десяти сред давал бы одиннадцать походов в базу.
    const spaceIds = memberships.map((row) => row.spaceId);
    const openCounts = await this.prisma.workTask.groupBy({
      by: ['spaceId'],
      where: { spaceId: { in: spaceIds }, completedAt: null, archivedAt: null },
      _count: { _all: true },
    });
    const openBySpace = new Map(
      openCounts.map((row) => [row.spaceId, row._count._all]),
    );

    return memberships.map((row) => ({
      id: row.space.id,
      name: row.space.name,
      prefix: row.space.prefix,
      description: row.space.description,
      color: normalizeWorkColor(row.space.color),
      isPersonal: row.space.isPersonal,
      role: row.role,
      memberCount: row.space._count.members,
      boardCount: row.space._count.boards,
      openTaskCount: openBySpace.get(row.spaceId) ?? 0,
      createdAt: row.space.createdAt.toISOString(),
    }));
  }

  async get(spaceId: string, userId: string): Promise<WorkSpaceDto> {
    const role = await this.roleOf(spaceId, userId);
    assertWorkAccess(role, 'view');

    const space = await this.prisma.workSpace.findUnique({
      where: { id: spaceId },
      include: {
        members: {
          include: { user: { select: workUserSelect } },
          orderBy: { joinedAt: 'asc' },
        },
        labels: { orderBy: { name: 'asc' } },
        boards: {
          where: { archivedAt: null },
          orderBy: { position: 'asc' },
          include: { _count: { select: { tasks: true } } },
        },
        _count: { select: { members: true, boards: true } },
      },
    });
    if (!space) throw new NotFoundException('Рабочая среда не найдена');

    const openTaskCount = await this.prisma.workTask.count({
      where: { spaceId, completedAt: null, archivedAt: null },
    });

    return {
      id: space.id,
      name: space.name,
      prefix: space.prefix,
      description: space.description,
      color: normalizeWorkColor(space.color),
      isPersonal: space.isPersonal,
      role,
      memberCount: space._count.members,
      boardCount: space._count.boards,
      openTaskCount,
      createdAt: space.createdAt.toISOString(),
      members: space.members.map(toWorkMember),
      labels: space.labels.map(toWorkLabel),
      boards: space.boards.map((board) => ({
        id: board.id,
        name: board.name,
        position: board.position,
        taskCount: board._count.tasks,
      })),
    };
  }

  /**
   * Новая среда приходит не пустой: доска и три колонки заводятся сразу.
   * Пустой экран с кнопкой «создайте колонку» — самая частая причина, по
   * которой трекер закрывают, не начав.
   */
  async create(
    userId: string,
    request: CreateWorkSpaceRequest,
    options: { isPersonal?: boolean } = {},
  ): Promise<WorkSpaceDto> {
    const name = requireSpaceName(request.name);
    const description = optionalText(
      request.description,
      'Описание',
      WORK_SPACE_DESCRIPTION_MAX,
    );

    const space = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workSpace.create({
        data: {
          ownerId: userId,
          name,
          prefix: workPrefixFromName(name),
          description,
          color: normalizeWorkColor(request.color),
          isPersonal: options.isPersonal ?? false,
          members: { create: { userId, role: 'owner' } },
        },
      });
      const board = await tx.workBoard.create({
        data: { spaceId: created.id, name: 'Доска', position: 0 },
      });
      await tx.workColumn.createMany({
        data: WORK_DEFAULT_COLUMNS.map((column, index) => ({
          boardId: board.id,
          name: column.name,
          isDone: column.isDone,
          position: index * WORK_POSITION_STEP,
        })),
      });
      return created;
    });

    return this.get(space.id, userId);
  }

  /**
   * Личная среда «Мои дела». Отдельной сущности под личный список нет: две
   * модели разъедутся на первом же желании позвать в него одного человека.
   */
  async ensurePersonal(userId: string): Promise<WorkSpaceSummaryDto> {
    const existing = await this.prisma.workSpace.findFirst({
      where: { ownerId: userId, isPersonal: true, archivedAt: null },
      select: { id: true },
    });
    if (!existing) {
      await this.create(
        userId,
        { name: 'Мои дела', color: 'cyan' },
        {
          isPersonal: true,
        },
      );
    }
    const spaces = await this.list(userId);
    const personal = spaces.find((space) => space.isPersonal);
    if (!personal) throw new NotFoundException('Личная среда не найдена');
    return personal;
  }

  async update(
    spaceId: string,
    userId: string,
    request: UpdateWorkSpaceRequest,
  ): Promise<WorkSpaceDto> {
    assertWorkAccess(await this.roleOf(spaceId, userId), 'editSpace');

    const data: Prisma.WorkSpaceUpdateInput = {};
    if (request.name !== undefined) data.name = requireSpaceName(request.name);
    if (request.description !== undefined) {
      data.description = optionalText(
        request.description,
        'Описание',
        WORK_SPACE_DESCRIPTION_MAX,
      );
    }
    if (request.color !== undefined) {
      data.color = normalizeWorkColor(request.color);
    }
    // Префикс за именем не тянется: номера уже разошлись по переписке, и
    // задача VM-14 не должна однажды стать VP-14.
    await this.prisma.workSpace.update({ where: { id: spaceId }, data });
    return this.get(spaceId, userId);
  }

  async remove(spaceId: string, userId: string): Promise<void> {
    assertWorkAccess(await this.roleOf(spaceId, userId), 'deleteSpace');
    await this.prisma.workSpace.delete({ where: { id: spaceId } });
  }

  async setMemberRole(
    spaceId: string,
    actorId: string,
    targetUserId: string,
    role: WorkMemberRole,
  ): Promise<void> {
    const actorRole = await this.roleOf(spaceId, actorId);
    assertWorkAccess(actorRole, 'manageMembers');
    if (!canAssignRole(actorRole, role)) {
      throw new BadRequestException('Такую роль назначить нельзя');
    }
    const target = await this.prisma.workSpaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Участник не найден');
    if (target.role === 'owner') {
      throw new BadRequestException(
        'Владельца нельзя понизить: сначала передайте владение',
      );
    }
    await this.prisma.workSpaceMember.update({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
      data: { role },
    });
  }

  /**
   * Исключить участника или выйти самому. Владелец не уходит: без него
   * остаётся среда, которую некому удалить, — сначала передача владения.
   */
  async removeMember(
    spaceId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<void> {
    const actorRole = await this.roleOf(spaceId, actorId);
    const leaving = actorId === targetUserId;
    assertWorkAccess(actorRole, leaving ? 'view' : 'manageMembers');

    const target = await this.prisma.workSpaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Участник не найден');
    if (target.role === 'owner') {
      throw new BadRequestException(
        'Владелец не может выйти: сначала передайте владение',
      );
    }
    if (!leaving && !canAssignRole(actorRole, target.role)) {
      throw new BadRequestException('Этого участника исключить нельзя');
    }
    await this.prisma.workSpaceMember.delete({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
    });
  }

  /** Передача владения: единственный законный способ сменить владельца. */
  async transferOwnership(
    spaceId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<void> {
    assertWorkAccess(await this.roleOf(spaceId, actorId), 'deleteSpace');
    const target = await this.prisma.workSpaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Участник не найден');

    await this.prisma.$transaction([
      this.prisma.workSpaceMember.update({
        where: { spaceId_userId: { spaceId, userId: targetUserId } },
        data: { role: 'owner' },
      }),
      this.prisma.workSpaceMember.update({
        where: { spaceId_userId: { spaceId, userId: actorId } },
        data: { role: 'admin' },
      }),
      this.prisma.workSpace.update({
        where: { id: spaceId },
        data: { ownerId: targetUserId },
      }),
    ]);
  }

  /** Сколько досок уже есть — предел от абсурда, не от жадности. */
  async assertBoardLimit(spaceId: string): Promise<void> {
    const boards = await this.prisma.workBoard.count({
      where: { spaceId, archivedAt: null },
    });
    if (boards >= WORK_MAX_BOARDS_PER_SPACE) {
      throw new BadRequestException(
        `Досок в одной среде не больше ${WORK_MAX_BOARDS_PER_SPACE}`,
      );
    }
  }
}
