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
  type WorkBoardCommercialDto,
  type WorkBoardDto,
  type WorkCurrency,
  type WorkLabelDto,
  type WorkArchiveDto,
  type WorkTaskSearchResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { columnDoneChange } from './work-column-done';
import {
  toWorkLabel,
  toWorkMember,
  toWorkPersonRef,
  toWorkTaskCard,
} from './work-dto';
import {
  canManageWorkFinance,
  parseWorkCommercialSettings,
} from './work-finance-settings';
import { workPayoutScheduleData } from './work-payout';
import { WORK_POSITION_STEP, resolveMovePosition } from './work-position';
import { assertWorkAccess } from './work-roles';
import { resolveTaskStatusMark } from './work-task-status';
import { loadWorkViewerState } from './work-viewer-state';
import { WorkSpacesService } from './work-spaces.service';
import { WorkAvatarService } from './work-avatar.service';
import {
  WORK_ARCHIVE_LIMIT,
  archiveOrderBy,
  archiveWhere,
  parseArchiveView,
} from './work-archive';
import {
  TASK_SEARCH_LIMIT,
  taskSearchWhere,
  taskSearchWords,
} from './work-task-search';
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
  // Загруженное фото: `avatarUrl` у него пуст, ссылку подписываем по ключу
  // (VED-492). Наружу ключ не едет — только подписанный `avatarUrl`.
  avatarKey: true,
  isAgent: true,
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
    private readonly avatars: WorkAvatarService,
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
    if (!column) throw new NotFoundException('Раздел не найден');
    return column.board.spaceId;
  }

  /**
   * Доска целиком — один запрос на открытие экрана. Колонки без карточек и
   * карточки без колонок по отдельности не нужны никому.
   */
  /**
   * Задачи доски, в которых нашлись все слова запроса (VED-76). Права — как
   * на просмотр доски: искать можно ровно то, что и так видно.
   */
  /**
   * Архив доски (VED-61): выполненные или убранные карточки, свежие первыми.
   * Права — как на просмотр доски: в архиве то же, что было на ней.
   */
  async archive(
    boardId: string,
    userId: string,
    rawView: unknown,
  ): Promise<WorkArchiveDto> {
    const spaceId = await this.spaceOfBoard(boardId);
    assertWorkAccess(await this.spaces.roleOf(spaceId, userId), 'view');

    const view = parseArchiveView(rawView);
    const [space, tasks] = await Promise.all([
      this.prisma.workSpace.findUnique({
        where: { id: spaceId },
        select: { prefix: true },
      }),
      this.prisma.workTask.findMany({
        where: archiveWhere(boardId, view),
        orderBy: archiveOrderBy(view),
        // На одну больше предела: так видно, что показаны не все.
        take: WORK_ARCHIVE_LIMIT + 1,
        include: { ...taskCardInclude, column: { select: { name: true } } },
      }),
    ]);
    const prefix = space?.prefix ?? '';
    const shown = tasks.slice(0, WORK_ARCHIVE_LIMIT);
    await this.avatars.signAvatars(shown.map((task) => task.assignee));
    const viewer = await loadWorkViewerState(this.prisma, shown, userId);

    return {
      view,
      hasMore: tasks.length > WORK_ARCHIVE_LIMIT,
      items: shown.map((task) => ({
        ...toWorkTaskCard(task, prefix, task.column.name, viewer.get(task.id)),
        columnName: task.column.name,
        archivedAt: task.archivedAt?.toISOString() ?? null,
      })),
    };
  }

  async searchTasks(
    boardId: string,
    userId: string,
    query: unknown,
  ): Promise<WorkTaskSearchResponse> {
    const spaceId = await this.spaceOfBoard(boardId);
    const role = await this.spaces.roleOf(spaceId, userId);
    assertWorkAccess(role, 'view');

    const words = taskSearchWords(query);
    const text = typeof query === 'string' ? query.trim() : '';
    if (words.length === 0) return { query: text, taskIds: [] };

    const space = await this.prisma.workSpace.findUnique({
      where: { id: spaceId },
      select: { prefix: true },
    });
    const tasks = await this.prisma.workTask.findMany({
      where: taskSearchWhere(boardId, words, space?.prefix ?? ''),
      select: { id: true },
      take: TASK_SEARCH_LIMIT,
    });
    return { query: text, taskIds: tasks.map((task) => task.id) };
  }

  async board(boardId: string, userId: string): Promise<WorkBoardDto> {
    const spaceId = await this.spaceOfBoard(boardId);
    const role = await this.spaces.roleOf(spaceId, userId);
    assertWorkAccess(role, 'view');

    const board = await this.prisma.workBoard.findUnique({
      where: { id: boardId },
      include: {
        lead: { select: workUserSelect },
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
    await this.avatars.signAvatars([
      ...board.space.members.map((member) => member.user),
      ...board.columns.flatMap((column) =>
        column.tasks.map((task) => task.assignee),
      ),
    ]);
    // «Чужое» и «Просмотрено» — для этого смотрящего (VED-320, VED-365).
    const viewer = await loadWorkViewerState(
      this.prisma,
      board.columns.flatMap((column) => column.tasks),
      userId,
    );

    const canSeeFinance =
      board.kind === 'commercial' &&
      canManageWorkFinance(role, board.leadId === userId);

    return {
      id: board.id,
      spaceId: board.spaceId,
      name: board.name,
      role,
      viewerId: userId,
      kind: board.kind,
      commercial:
        board.kind === 'commercial'
          ? toCommercialDto(board, canSeeFinance)
          : null,
      canSeeFinance,
      labels: board.space.labels.map(toWorkLabel),
      members: board.space.members.map(toWorkMember),
      columns: board.columns.map((column) => ({
        id: column.id,
        name: column.name,
        position: column.position,
        wipLimit: column.wipLimit,
        isDone: column.isDone,
        // Тот же разбор, что и у карточек: доска переносит карточку
        // оптимистично и берёт ярлык отсюда (VED-311, VED-320).
        statusMark: resolveTaskStatusMark(column.name),
        tasks: column.tasks.map((task) =>
          toWorkTaskCard(
            task,
            board.space.prefix,
            column.name,
            viewer.get(task.id),
          ),
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
    const commercial = request.commercial
      ? parseWorkCommercialSettings(request.commercial)
      : null;
    const board = await this.prisma.workBoard.create({
      data: {
        spaceId,
        name: requireText(request.name, 'Название доски', WORK_BOARD_NAME_MAX),
        position: (last?.position ?? 0) + WORK_POSITION_STEP,
        ...(commercial
          ? {
              ...commercial,
              ...workPayoutScheduleData(
                commercial,
                {
                  payoutPeriod: 'weekly',
                  payoutDay: 5,
                  timezone: commercial.timezone ?? 'Europe/Moscow',
                },
                new Date(),
              ),
              kind: 'commercial',
              leadId: userId,
            }
          : {}),
      },
    });
    return this.board(board.id, userId);
  }

  async updateBoard(
    boardId: string,
    userId: string,
    request: UpdateWorkBoardRequest,
  ): Promise<WorkBoardDto> {
    const current = await this.prisma.workBoard.findUnique({
      where: { id: boardId },
      select: {
        spaceId: true,
        leadId: true,
        kind: true,
        payoutPeriod: true,
        payoutDay: true,
        timezone: true,
      },
    });
    if (!current) throw new NotFoundException('Доска не найдена');
    const role = await this.spaces.roleOf(current.spaceId, userId);
    // Настройки оплаты и ведущего меняет ведущий доски, даже не будучи
    // администратором среды; название и прочее — как раньше, администрация.
    const onlyMoney =
      request.name === undefined &&
      (request.commercial !== undefined || request.leadId !== undefined);
    if (onlyMoney) {
      assertWorkAccess(role, 'view');
      if (!canManageWorkFinance(role, current.leadId === userId)) {
        assertWorkAccess(role, 'manageBoard');
      }
    } else {
      assertWorkAccess(role, 'manageBoard');
    }

    await this.applyCommercial(boardId, current, userId, request);

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

  /**
   * Настройки оплаты (VED-458): объект делает доску коммерческой, `null` —
   * обычной. Ведущий назначается из участников среды; у новой коммерческой
   * доски без ведущего им становится тот, кто её переключил.
   */
  private async applyCommercial(
    boardId: string,
    current: {
      spaceId: string;
      leadId: string | null;
      kind: string;
      payoutPeriod: 'weekly' | 'biweekly' | 'monthly';
      payoutDay: number;
      timezone: string;
    },
    userId: string,
    request: UpdateWorkBoardRequest,
  ): Promise<void> {
    const data: Prisma.WorkBoardUpdateInput = {};
    if (request.commercial === null) {
      data.kind = 'regular';
    } else if (request.commercial !== undefined) {
      const settings = parseWorkCommercialSettings(request.commercial);
      Object.assign(
        data,
        settings,
        workPayoutScheduleData(
          settings,
          { ...current, timezone: settings.timezone ?? current.timezone },
          new Date(),
        ),
      );
      data.kind = 'commercial';
      // Обычная доска стала коммерческой — выплаты считаются с этого часа,
      // если по ней ещё никто не записывал время.
      if (current.kind !== 'commercial') {
        const tracked = await this.prisma.workTimeEntry.count({
          where: { boardId },
        });
        if (tracked === 0) data.commercialSince = new Date();
      }
      if (!current.leadId && request.leadId === undefined) {
        data.lead = { connect: { id: userId } };
      }
    }
    if (request.leadId !== undefined) {
      const member = await this.spaces.roleOf(current.spaceId, request.leadId);
      if (!member) {
        throw new BadRequestException('Ведущий: нужен участник среды');
      }
      data.lead = { connect: { id: request.leadId } };
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.workBoard.update({ where: { id: boardId }, data });
    }
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
        `Разделов на доске не больше ${WORK_MAX_COLUMNS_PER_BOARD}`,
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
          'Название раздела',
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
    if (!column) throw new NotFoundException('Раздел не найден');

    const data: Prisma.WorkColumnUpdateInput = {};
    if (request.name !== undefined) {
      data.name = requireText(
        request.name,
        'Название раздела',
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
    if (!column) throw new NotFoundException('Раздел не найден');
    if (column._count.tasks > 0) {
      throw new BadRequestException(
        'В разделе есть карточки — сначала перенесите их',
      );
    }
    const left = await this.prisma.workColumn.count({
      where: { boardId: column.boardId },
    });
    if (left <= 1) {
      throw new BadRequestException('Последний раздел удалить нельзя');
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

/** Настройки оплаты наружу: ставки и бюджет — только тем, кто видит деньги. */
function toCommercialDto(
  board: {
    clientName: string;
    currency: string;
    pricingModel: WorkBoardCommercialDto['pricingModel'];
    dailyNormMinutes: number;
    overtimeMode: WorkBoardCommercialDto['overtimeMode'];
    timezone: string;
    rateMinor: number;
    overtimeRateMinor: number;
    budgetMinor: number;
    payoutPeriod: WorkBoardCommercialDto['payoutPeriod'];
    payoutDay: number;
    paymentReminderDays: number;
    lead: Parameters<typeof toWorkPersonRef>[0] | null;
  },
  canSeeFinance: boolean,
): WorkBoardCommercialDto {
  return {
    clientName: board.clientName,
    currency: board.currency as WorkCurrency,
    pricingModel: board.pricingModel,
    dailyNormMinutes: board.dailyNormMinutes,
    overtimeMode: board.overtimeMode,
    timezone: board.timezone,
    lead: board.lead ? toWorkPersonRef(board.lead) : null,
    payoutPeriod: board.payoutPeriod,
    payoutDay: board.payoutDay,
    paymentReminderDays: board.paymentReminderDays,
    rates: canSeeFinance
      ? {
          rateMinor: board.rateMinor,
          overtimeRateMinor: board.overtimeRateMinor,
          budgetMinor: board.budgetMinor,
        }
      : null,
  };
}
