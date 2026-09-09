import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  WORK_BOARD_NAME_MAX,
  WORK_COLUMN_NAME_MAX,
  WORK_LABEL_NAME_MAX,
  WORK_MAX_COLUMNS_PER_BOARD,
  type CreateWorkBoardRequest,
  type CreateWorkColumnRequest,
  type CreateWorkLabelRequest,
  type UpdateWorkBoardRequest,
  type UpdateWorkColumnRequest,
  type WorkBoardDto,
  type WorkLabelDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { columnDoneChange } from './work-column-done';
import { toWorkLabel, toWorkMember, toWorkTaskCard } from './work-dto';
import { WORK_POSITION_STEP, resolveMovePosition } from './work-position';
import { assertWorkAccess } from './work-roles';
import { WorkSpacesService } from './work-spaces.service';
import {
  normalizeWipLimit,
  normalizeWorkColor,
  requireText,
} from './work-validate';

const workUserSelect = {
  id: true,
  name: true,
  spiritualName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

/** Карточка на доске: ровно те поля, что рисуются, не открывая её. */
const taskCardInclude = {
  assignee: { select: workUserSelect },
  labels: { include: { label: true } },
  checklist: { select: { done: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.WorkTaskInclude;

@Injectable()
export class WorkBoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: WorkSpacesService,
  ) {}

  /** К какой среде принадлежит доска — вопрос перед каждой проверкой прав. */
  private async spaceOfBoard(boardId: string): Promise<string> {
    const board = await this.prisma.workBoard.findUnique({
      where: { id: boardId },
      select: { spaceId: true },
    });
    if (!board) throw new NotFoundException('Доска не найдена');
    return board.spaceId;
  }

  private async spaceOfColumn(columnId: string): Promise<string> {
    const column = await this.prisma.workColumn.findUnique({
      where: { id: columnId },
      select: { board: { select: { spaceId: true } } },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');
    return column.board.spaceId;
  }

  /**
   * Доска целиком — один запрос на открытие экрана. Колонки без карточек и
   * карточки без колонок по отдельности не нужны никому.
   */
  async board(boardId: string, userId: string): Promise<WorkBoardDto> {
    const spaceId = await this.spaceOfBoard(boardId);
    const role = await this.spaces.roleOf(spaceId, userId);
    assertWorkAccess(role, 'view');

    const board = await this.prisma.workBoard.findUnique({
      where: { id: boardId },
      include: {
        space: {
          select: {
            prefix: true,
            labels: { orderBy: { name: 'asc' } },
            members: {
              include: { user: { select: workUserSelect } },
              orderBy: { joinedAt: 'asc' },
            },
          },
        },
        columns: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              where: { archivedAt: null },
              orderBy: { position: 'asc' },
              include: taskCardInclude,
            },
          },
        },
      },
    });
    if (!board) throw new NotFoundException('Доска не найдена');

    return {
      id: board.id,
      spaceId: board.spaceId,
      name: board.name,
      role,
      viewerId: userId,
      labels: board.space.labels.map(toWorkLabel),
      members: board.space.members.map(toWorkMember),
      columns: board.columns.map((column) => ({
        id: column.id,
        name: column.name,
        position: column.position,
        wipLimit: column.wipLimit,
        isDone: column.isDone,
        tasks: column.tasks.map((task) =>
          toWorkTaskCard(task, board.space.prefix),
        ),
      })),
    };
  }

  async createBoard(
    spaceId: string,
    userId: string,
    request: CreateWorkBoardRequest,
  ): Promise<WorkBoardDto> {
    assertWorkAccess(await this.spaces.roleOf(spaceId, userId), 'manageBoard');
    await this.spaces.assertBoardLimit(spaceId);

    const last = await this.prisma.workBoard.findFirst({
      where: { spaceId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const board = await this.prisma.workBoard.create({
      data: {
        spaceId,
        name: requireText(request.name, 'Название доски', WORK_BOARD_NAME_MAX),
        position: (last?.position ?? 0) + WORK_POSITION_STEP,
      },
    });
    return this.board(board.id, userId);
  }

  async updateBoard(
    boardId: string,
    userId: string,
    request: UpdateWorkBoardRequest,
  ): Promise<WorkBoardDto> {
    const spaceId = await this.spaceOfBoard(boardId);
    assertWorkAccess(await this.spaces.roleOf(spaceId, userId), 'manageBoard');

    if (request.name !== undefined) {
      await this.prisma.workBoard.update({
        where: { id: boardId },
        data: {
          name: requireText(
            request.name,
            'Название доски',
            WORK_BOARD_NAME_MAX,
          ),
        },
      });
    }
    return this.board(boardId, userId);
  }

  async removeBoard(boardId: string, userId: string): Promise<void> {
    const spaceId = await this.spaceOfBoard(boardId);
    assertWorkAccess(await this.spaces.roleOf(spaceId, userId), 'manageBoard');

    const boards = await this.prisma.workBoard.count({
      where: { spaceId, archivedAt: null },
    });
    if (boards <= 1) {
      throw new BadRequestException(
        'Это последняя доска среды — удалите саму среду',
      );
    }
    await this.prisma.workBoard.delete({ where: { id: boardId } });
  }

  async createColumn(
    boardId: string,
    userId: string,
    request: CreateWorkColumnRequest,
  ): Promise<WorkBoardDto> {
    const spaceId = await this.spaceOfBoard(boardId);
    assertWorkAccess(await this.spaces.roleOf(spaceId, userId), 'manageBoard');

    const count = await this.prisma.workColumn.count({ where: { boardId } });
    if (count >= WORK_MAX_COLUMNS_PER_BOARD) {
      throw new BadRequestException(
        `Колонок на доске не больше ${WORK_MAX_COLUMNS_PER_BOARD}`,
      );
    }
    const last = await this.prisma.workColumn.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    await this.prisma.workColumn.create({
      data: {
        boardId,
        name: requireText(
          request.name,
          'Название колонки',
          WORK_COLUMN_NAME_MAX,
        ),
        wipLimit: normalizeWipLimit(request.wipLimit),
        isDone: request.isDone ?? false,
        position: (last?.position ?? 0) + WORK_POSITION_STEP,
      },
    });
    return this.board(boardId, userId);
  }

  async updateColumn(
    columnId: string,
    userId: string,
    request: UpdateWorkColumnRequest,
  ): Promise<WorkBoardDto> {
    const spaceId = await this.spaceOfColumn(columnId);
    assertWorkAccess(await this.spaces.roleOf(spaceId, userId), 'manageBoard');

    const column = await this.prisma.workColumn.findUnique({
      where: { id: columnId },
      select: { boardId: true, isDone: true },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');

    const data: Prisma.WorkColumnUpdateInput = {};
    if (request.name !== undefined) {
      data.name = requireText(
        request.name,
        'Название колонки',
        WORK_COLUMN_NAME_MAX,
      );
    }
    if (request.wipLimit !== undefined) {
      data.wipLimit = normalizeWipLimit(request.wipLimit);
    }
    if (request.isDone !== undefined) data.isDone = request.isDone;

    if (
      request.afterColumnId !== undefined ||
      request.beforeColumnId !== undefined
    ) {
      const ordered = await this.prisma.workColumn.findMany({
        where: { boardId: column.boardId },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      const { position, rebalance } = resolveMovePosition(
        ordered.filter((item) => item.id !== columnId),
        request.afterColumnId,
        request.beforeColumnId,
      );
      data.position = position;
      if (rebalance) {
        // Колонок мало, перекладывать их дёшево: считаем порядок заново, а не
        // изобретаем для дюжины строк второй механизм.
        await this.rebalanceColumns(column.boardId);
      }
    }

    await this.prisma.workColumn.update({ where: { id: columnId }, data });

    // Карточки догоняют колонку: свою «Выполнено» отмечают завершающей уже
    // после того, как в неё сложили сделанное. См. work-column-done.ts.
    const done = columnDoneChange(column.isDone, request.isDone, new Date());
    if (done) {
      await this.prisma.workTask.updateMany({
        where: {
          columnId,
          archivedAt: null,
          ...(done.completedAt ? { completedAt: null } : {}),
        },
        data: { completedAt: done.completedAt },
      });
    }

    return this.board(column.boardId, userId);
  }

  private async rebalanceColumns(boardId: string): Promise<void> {
    const ordered = await this.prisma.workColumn.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    await this.prisma.$transaction(
      ordered.map((column, index) =>
        this.prisma.workColumn.update({
          where: { id: column.id },
          data: { position: index * WORK_POSITION_STEP },
        }),
      ),
    );
  }

  /** Колонка с карточками не удаляется: молча потерянные задачи — не «удаление». */
  async removeColumn(columnId: string, userId: string): Promise<WorkBoardDto> {
    const spaceId = await this.spaceOfColumn(columnId);
    assertWorkAccess(await this.spaces.roleOf(spaceId, userId), 'manageBoard');

    const column = await this.prisma.workColumn.findUnique({
      where: { id: columnId },
      select: {
        boardId: true,
        // Архивные не в счёт: на доске их не видно, перенести их нельзя, и
        // колонка из-за них оставалась неудаляемой навсегда — с отказом
        // «в колонке есть карточки», которому человек справедливо не верил,
        // потому что колонка перед ним пустая.
        _count: { select: { tasks: { where: { archivedAt: null } } } },
      },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');
    if (column._count.tasks > 0) {
      throw new BadRequestException(
        'В колонке есть карточки — сначала перенесите их',
      );
    }
    const left = await this.prisma.workColumn.count({
      where: { boardId: column.boardId },
    });
    if (left <= 1) {
      throw new BadRequestException('Последнюю колонку удалить нельзя');
    }
    await this.prisma.workColumn.delete({ where: { id: columnId } });
    return this.board(column.boardId, userId);
  }

  async createLabel(
    spaceId: string,
    userId: string,
    request: CreateWorkLabelRequest,
  ): Promise<WorkLabelDto> {
    assertWorkAccess(await this.spaces.roleOf(spaceId, userId), 'manageBoard');
    const name = requireText(
      request.name,
      'Название метки',
      WORK_LABEL_NAME_MAX,
    );
    const existing = await this.prisma.workLabel.findUnique({
      where: { spaceId_name: { spaceId, name } },
    });
    if (existing) throw new BadRequestException('Такая метка уже есть');

    const label = await this.prisma.workLabel.create({
      data: { spaceId, name, color: normalizeWorkColor(request.color) },
    });
    return toWorkLabel(label);
  }

  async removeLabel(labelId: string, userId: string): Promise<void> {
    const label = await this.prisma.workLabel.findUnique({
      where: { id: labelId },
      select: { spaceId: true },
    });
    if (!label) throw new NotFoundException('Метка не найдена');
    assertWorkAccess(
      await this.spaces.roleOf(label.spaceId, userId),
      'manageBoard',
    );
    await this.prisma.workLabel.delete({ where: { id: labelId } });
  }
}
