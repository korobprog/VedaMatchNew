import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import {
  WORK_OVERTIME_REASON_MAX,
  WORK_TIME_ENTRY_MAX_MINUTES,
  WORK_TIME_NOTE_MAX,
  resolveDisplayName,
  type CreateWorkLineItemRequest,
  type CreateWorkOvertimeRequest,
  type CreateWorkTimeEntryRequest,
  type DecideWorkOvertimeRequest,
  type UpdateWorkTaskFinanceRequest,
  type WorkBoardFinanceDto,
  type WorkCurrency,
  type WorkMemberRole,
  type WorkOvertimeRequestDto,
  type WorkOvertimeRequestsDto,
  type WorkTaskFinanceDto,
  type WorkTimeEntryDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toWorkPersonRef } from './work-dto';
import { WORK_EVENTS } from './work-events';
import {
  type WorkFinanceRules,
  type WorkOvertimeAllowance,
  type WorkSpanSplit,
  type WorkTimeSpan,
  workAllowanceFrom,
  workClassifySpans,
  workDaysInclusive,
  workLocalDay,
  workOvertimeRequestMaxCost,
  workEstimateCost,
  workSpanCost,
  workTaskTotals,
} from './work-finance';
import {
  canManageWorkFinance,
  parseWorkLineItem,
  parseWorkMinutes,
  parseWorkMoney,
  parseWorkOvertimeRequest,
  parseWorkTimeEntry,
} from './work-finance-settings';
import { WORK_POSITION_STEP } from './work-position';
import { assertWorkAccess } from './work-roles';
import { WorkSpacesService } from './work-spaces.service';
import { optionalText, workTaskKey } from './work-validate';

const MINUTE_MS = 60_000;
/** Сколько назад смотреть за соседними записями: норма считается по суткам,
 *  а запись длится не дольше суток, — с запасом на пояс. */
const NORM_LOOKBACK_MS = 26 * 60 * MINUTE_MS;
/** Оценка задачи — не больше тысячи часов: больше — опечатка. */
const ESTIMATE_MAX_MINUTES = 1000 * 60;

const workUserSelect = {
  id: true,
  name: true,
  spiritualName: true,
  avatarUrl: true,
  isAgent: true,
} satisfies Prisma.UserSelect;

const boardRulesSelect = {
  id: true,
  spaceId: true,
  kind: true,
  leadId: true,
  currency: true,
  pricingModel: true,
  rateMinor: true,
  dailyNormMinutes: true,
  overtimeRateMinor: true,
  overtimeMode: true,
  budgetMinor: true,
  timezone: true,
} satisfies Prisma.WorkBoardSelect;

type BoardRulesRow = Prisma.WorkBoardGetPayload<{
  select: typeof boardRulesSelect;
}>;

function rulesOf(board: BoardRulesRow): WorkFinanceRules {
  return {
    pricingModel: board.pricingModel,
    rateMinor: board.rateMinor,
    dailyNormMinutes: board.dailyNormMinutes,
    overtimeRateMinor: board.overtimeRateMinor,
    overtimeMode: board.overtimeMode,
    timezone: board.timezone,
  };
}

/** Идущий таймер считается до «сейчас», но не дольше суток. */
function spanEnd(startedAt: Date, endedAt: Date | null, now: Date): Date {
  if (endedAt) return endedAt;
  const cap = startedAt.getTime() + WORK_TIME_ENTRY_MAX_MINUTES * MINUTE_MS;
  return new Date(Math.min(now.getTime(), cap));
}

const overtimeRequestInclude = {
  user: { select: workUserSelect },
  decidedBy: { select: workUserSelect },
  task: {
    select: {
      id: true,
      number: true,
      title: true,
      space: { select: { prefix: true } },
    },
  },
} satisfies Prisma.WorkOvertimeRequestInclude;

type OvertimeRequestRow = Prisma.WorkOvertimeRequestGetPayload<{
  include: typeof overtimeRequestInclude;
}>;

const EMPTY_SPLIT: WorkSpanSplit = {
  minutes: 0,
  normalMinutes: 0,
  overtimeMinutes: 0,
  approvedOvertimeMinutes: 0,
};

/** Просить сверх нормы есть смысл только там, где его одобряют. */
function overtimeNeedsRequest(board: BoardRulesRow): boolean {
  return (
    board.pricingModel === 'hourly' &&
    board.overtimeMode === 'on_request' &&
    board.dailyNormMinutes > 0
  );
}

interface FinanceContext {
  board: BoardRulesRow;
  role: WorkMemberRole;
  finance: boolean;
}

/**
 * Время и стоимость коммерческой доски (VED-458). Деньги доски целиком видят
 * ведущий и администрация; исполнитель — свои часы и свои суммы.
 */
@Injectable()
export class WorkFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: WorkSpacesService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Одобренные запросы доски, чей период ещё не кончился к `fromDay`, —
   * разрешение сверх нормы по дням и людям.
   */
  private async allowanceFor(
    boardId: string,
    fromDay: string,
    userIds?: string[],
  ): Promise<WorkOvertimeAllowance> {
    const approved = await this.prisma.workOvertimeRequest.findMany({
      where: {
        boardId,
        status: 'approved',
        toDay: { gte: fromDay },
        ...(userIds ? { userId: { in: userIds } } : {}),
      },
      select: {
        userId: true,
        fromDay: true,
        toDay: true,
        minutesPerDay: true,
      },
    });
    return workAllowanceFrom(approved);
  }

  private async contextOfBoard(
    board: BoardRulesRow | null,
    userId: string,
  ): Promise<FinanceContext> {
    if (!board) throw new NotFoundException('Доска не найдена');
    const role = await this.spaces.roleOf(board.spaceId, userId);
    assertWorkAccess(role, 'view');
    if (board.kind !== 'commercial') {
      throw new BadRequestException('Доска не коммерческая');
    }
    return {
      board,
      role,
      finance: canManageWorkFinance(role, board.leadId === userId),
    };
  }

  private async taskContext(taskId: string, userId: string) {
    const task = await this.prisma.workTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        estimateMinutes: true,
        priceMinor: true,
        board: { select: boardRulesSelect },
      },
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    const context = await this.contextOfBoard(task.board, userId);
    return { task, ...context };
  }

  private assertFinance(context: FinanceContext): void {
    if (!context.finance) {
      throw new ForbiddenException(
        'Деньги доски меняют ведущий и администрация среды',
      );
    }
  }

  /**
   * Норма и сверх нормы для набора записей: соседние записи тех же людей на
   * всей доске тоже нужны — норма общая на день, а не на задачу.
   */
  private async splitsFor(
    board: BoardRulesRow,
    spans: WorkTimeSpan[],
    now: Date,
  ): Promise<Map<string, WorkSpanSplit>> {
    if (spans.length === 0) return new Map();
    const from = Math.min(...spans.map((span) => span.startedAt.getTime()));
    const to = Math.max(...spans.map((span) => span.endedAt.getTime()));
    const userIds = [
      ...new Set(spans.map((span) => span.userId).filter(Boolean)),
    ] as string[];
    const neighbours = await this.prisma.workTimeEntry.findMany({
      where: {
        boardId: board.id,
        userId: { in: userIds },
        startedAt: {
          gte: new Date(from - NORM_LOOKBACK_MS),
          lte: new Date(to),
        },
      },
      select: { id: true, userId: true, startedAt: true, endedAt: true },
    });
    const all = new Map<string, WorkTimeSpan>();
    for (const row of neighbours) {
      all.set(row.id, {
        id: row.id,
        userId: row.userId,
        startedAt: row.startedAt,
        endedAt: spanEnd(row.startedAt, row.endedAt, now),
      });
    }
    for (const span of spans) all.set(span.id, span);
    const allowance = await this.allowanceFor(
      board.id,
      workLocalDay(new Date(from - NORM_LOOKBACK_MS), board.timezone),
      userIds,
    );
    return workClassifySpans(
      [...all.values()],
      board.dailyNormMinutes,
      board.timezone,
      allowance,
    );
  }

  async taskFinance(
    taskId: string,
    userId: string,
    now = new Date(),
  ): Promise<WorkTaskFinanceDto> {
    const { task, board, finance } = await this.taskContext(taskId, userId);
    const rules = rulesOf(board);
    const [rows, lineItems, requests] = await Promise.all([
      this.prisma.workTimeEntry.findMany({
        where: { taskId },
        orderBy: { startedAt: 'desc' },
        include: { user: { select: workUserSelect } },
      }),
      this.prisma.workTaskLineItem.findMany({
        where: { taskId },
        orderBy: { position: 'asc' },
      }),
      this.prisma.workOvertimeRequest.findMany({
        where: { taskId, ...(finance ? {} : { userId }) },
        orderBy: { createdAt: 'desc' },
        include: overtimeRequestInclude,
      }),
    ]);
    const spans = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      startedAt: row.startedAt,
      endedAt: spanEnd(row.startedAt, row.endedAt, now),
    }));
    const splits = await this.splitsFor(board, spans, now);

    let mineMinutes = 0;
    let mineAmount = 0;
    let running: WorkTimeEntryDto | null = null;
    const entries = rows.map((row): WorkTimeEntryDto => {
      const split = splits.get(row.id) ?? EMPTY_SPLIT;
      const mine = row.userId === userId;
      const amount = workSpanCost(split, rules);
      if (mine) {
        mineMinutes += split.minutes;
        mineAmount += amount;
      }
      const dto: WorkTimeEntryDto = {
        id: row.id,
        person: row.user ? toWorkPersonRef(row.user) : null,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        ...split,
        note: row.note,
        amountMinor: finance || mine ? amount : null,
        mine,
      };
      if (mine && !row.endedAt) running = dto;
      return dto;
    });

    const totals = workTaskTotals(
      rows.flatMap((row) => {
        const split = splits.get(row.id);
        return split ? [split] : [];
      }),
      lineItems,
      rules,
      task.priceMinor,
    );
    return {
      taskId,
      currency: board.currency as WorkCurrency,
      pricingModel: board.pricingModel,
      overtimeMode: board.overtimeMode,
      dailyNormMinutes: board.dailyNormMinutes,
      estimateMinutes: task.estimateMinutes,
      estimateMinor: finance
        ? workEstimateCost(task.estimateMinutes, task.priceMinor, rules)
        : null,
      priceMinor: finance ? task.priceMinor : null,
      entries,
      lineItems: finance
        ? lineItems.map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            amountMinor: item.amountMinor,
          }))
        : [],
      totals: {
        minutes: totals.minutes,
        normalMinutes: totals.normalMinutes,
        overtimeMinutes: totals.overtimeMinutes,
        pendingOvertimeMinutes: totals.pendingOvertimeMinutes,
        workMinor: finance ? totals.workMinor : null,
        expensesMinor: finance ? totals.expensesMinor : null,
        discountMinor: finance ? totals.discountMinor : null,
        totalMinor: finance ? totals.totalMinor : null,
      },
      mine: { minutes: mineMinutes, amountMinor: mineAmount },
      running,
      canSeeFinance: finance,
      today: workLocalDay(now, board.timezone),
      overtimeRequests: requests.map((row) =>
        this.toRequestDto(row, board, userId, finance),
      ),
      canRequestOvertime: overtimeNeedsRequest(board),
    };
  }

  /** Оценка — любому, кто правит задачи; цена — только ведущему. */
  async updateTaskFinance(
    taskId: string,
    userId: string,
    request: UpdateWorkTaskFinanceRequest,
  ): Promise<WorkTaskFinanceDto> {
    const context = await this.taskContext(taskId, userId);
    assertWorkAccess(context.role, 'editTask');
    const data: Prisma.WorkTaskUpdateInput = {};
    if (request.estimateMinutes !== undefined) {
      data.estimateMinutes =
        request.estimateMinutes === null
          ? null
          : parseWorkMinutes(
              request.estimateMinutes,
              'Оценка',
              ESTIMATE_MAX_MINUTES,
            );
    }
    if (request.priceMinor !== undefined) {
      this.assertFinance(context);
      data.priceMinor =
        request.priceMinor === null
          ? null
          : parseWorkMoney(request.priceMinor, 'Цена задачи');
    }
    await this.prisma.workTask.update({ where: { id: taskId }, data });
    return this.taskFinance(taskId, userId);
  }

  /**
   * Запустить таймер. Человек делает одно дело за раз: идущий таймер в любой
   * другой задаче останавливается.
   */
  async startTimer(
    taskId: string,
    userId: string,
    now = new Date(),
  ): Promise<WorkTaskFinanceDto> {
    const { board, role } = await this.taskContext(taskId, userId);
    assertWorkAccess(role, 'editTask');
    await this.prisma.$transaction(async (tx) => {
      const runningRows = await tx.workTimeEntry.findMany({
        where: { userId, endedAt: null },
        select: { id: true, startedAt: true },
      });
      for (const row of runningRows) {
        await this.closeEntry(tx, row, now);
      }
      await tx.workTimeEntry.create({
        data: { boardId: board.id, taskId, userId, startedAt: now },
      });
    });
    return this.taskFinance(taskId, userId, now);
  }

  async stopTimer(
    taskId: string,
    userId: string,
    now = new Date(),
  ): Promise<WorkTaskFinanceDto> {
    const { role } = await this.taskContext(taskId, userId);
    assertWorkAccess(role, 'editTask');
    await this.prisma.$transaction(async (tx) => {
      const runningRows = await tx.workTimeEntry.findMany({
        where: { taskId, userId, endedAt: null },
        select: { id: true, startedAt: true },
      });
      for (const row of runningRows) {
        await this.closeEntry(tx, row, now);
      }
    });
    return this.taskFinance(taskId, userId, now);
  }

  /** Закрыть идущую запись; меньше минуты — не работа, а случайное нажатие. */
  private async closeEntry(
    tx: Prisma.TransactionClient,
    row: { id: string; startedAt: Date },
    now: Date,
  ): Promise<void> {
    const endedAt = spanEnd(row.startedAt, null, now);
    if (endedAt.getTime() - row.startedAt.getTime() < MINUTE_MS) {
      await tx.workTimeEntry.delete({ where: { id: row.id } });
      return;
    }
    await tx.workTimeEntry.update({ where: { id: row.id }, data: { endedAt } });
  }

  /** Своё время задним числом. */
  async addTime(
    taskId: string,
    userId: string,
    request: CreateWorkTimeEntryRequest,
    now = new Date(),
  ): Promise<WorkTaskFinanceDto> {
    const { board, role } = await this.taskContext(taskId, userId);
    assertWorkAccess(role, 'editTask');
    const span = parseWorkTimeEntry(request.startedAt, request.minutes, now);
    await this.prisma.workTimeEntry.create({
      data: {
        boardId: board.id,
        taskId,
        userId,
        ...span,
        note: optionalText(request.note, 'Заметка', WORK_TIME_NOTE_MAX),
      },
    });
    return this.taskFinance(taskId, userId, now);
  }

  /** Своя запись — самому; чужая — ведущему и администрации. */
  async removeTime(
    entryId: string,
    userId: string,
  ): Promise<WorkTaskFinanceDto> {
    const entry = await this.prisma.workTimeEntry.findUnique({
      where: { id: entryId },
      select: { taskId: true, userId: true },
    });
    if (!entry) throw new NotFoundException('Запись времени не найдена');
    const context = await this.taskContext(entry.taskId, userId);
    assertWorkAccess(context.role, 'editTask');
    if (entry.userId !== userId) this.assertFinance(context);
    await this.prisma.workTimeEntry.delete({ where: { id: entryId } });
    return this.taskFinance(entry.taskId, userId);
  }

  async addLineItem(
    taskId: string,
    userId: string,
    request: CreateWorkLineItemRequest,
  ): Promise<WorkTaskFinanceDto> {
    const context = await this.taskContext(taskId, userId);
    this.assertFinance(context);
    const item = parseWorkLineItem(request);
    const last = await this.prisma.workTaskLineItem.findFirst({
      where: { taskId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    await this.prisma.workTaskLineItem.create({
      data: {
        taskId,
        ...item,
        position: (last?.position ?? 0) + WORK_POSITION_STEP,
      },
    });
    return this.taskFinance(taskId, userId);
  }

  async removeLineItem(
    itemId: string,
    userId: string,
  ): Promise<WorkTaskFinanceDto> {
    const item = await this.prisma.workTaskLineItem.findUnique({
      where: { id: itemId },
      select: { taskId: true },
    });
    if (!item) throw new NotFoundException('Строка сметы не найдена');
    const context = await this.taskContext(item.taskId, userId);
    this.assertFinance(context);
    await this.prisma.workTaskLineItem.delete({ where: { id: itemId } });
    return this.taskFinance(item.taskId, userId);
  }

  /**
   * Шапка доски: бюджет и сколько израсходовано. При фиксированной цене
   * израсходованной считается цена закрытых задач — открытая ещё не сделана.
   */
  async boardFinance(
    boardId: string,
    userId: string,
    now = new Date(),
  ): Promise<WorkBoardFinanceDto> {
    const board = await this.prisma.workBoard.findUnique({
      where: { id: boardId },
      select: boardRulesSelect,
    });
    const context = await this.contextOfBoard(board, userId);
    this.assertFinance(context);
    const rules = rulesOf(context.board);

    const [rows, tasks] = await Promise.all([
      this.prisma.workTimeEntry.findMany({
        where: { boardId },
        select: {
          id: true,
          taskId: true,
          userId: true,
          startedAt: true,
          endedAt: true,
        },
      }),
      this.prisma.workTask.findMany({
        where: {
          boardId,
          OR: [{ priceMinor: { not: null } }, { lineItems: { some: {} } }],
        },
        select: {
          id: true,
          priceMinor: true,
          completedAt: true,
          lineItems: { select: { kind: true, amountMinor: true } },
        },
      }),
    ]);
    const [allowance, pendingRequestCount] = await Promise.all([
      this.allowanceFor(boardId, '0000-00-00'),
      this.prisma.workOvertimeRequest.count({
        where: { boardId, status: 'pending' },
      }),
    ]);
    const splits = workClassifySpans(
      rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        startedAt: row.startedAt,
        endedAt: spanEnd(row.startedAt, row.endedAt, now),
      })),
      rules.dailyNormMinutes,
      rules.timezone,
      allowance,
    );
    const time = workTaskTotals([...splits.values()], [], rules, null);
    let spentMinor = rules.pricingModel === 'hourly' ? time.workMinor : 0;
    for (const task of tasks) {
      const price =
        rules.pricingModel === 'fixed' && task.completedAt
          ? task.priceMinor
          : null;
      spentMinor += workTaskTotals(
        [],
        task.lineItems,
        { ...rules, pricingModel: 'fixed' },
        price,
      ).totalMinor;
    }
    return {
      boardId,
      currency: context.board.currency as WorkCurrency,
      budgetMinor: context.board.budgetMinor,
      spentMinor,
      minutes: time.minutes,
      overtimeMinutes: time.overtimeMinutes,
      pendingOvertimeMinutes: time.pendingOvertimeMinutes,
      pendingRequestCount,
    };
  }

  private toRequestDto(
    row: OvertimeRequestRow,
    board: BoardRulesRow,
    viewerId: string,
    finance: boolean,
  ): WorkOvertimeRequestDto {
    const mine = row.userId === viewerId;
    return {
      id: row.id,
      boardId: row.boardId,
      task: row.task
        ? {
            id: row.task.id,
            key: workTaskKey(row.task.space.prefix, row.task.number),
            title: row.task.title,
          }
        : null,
      person: row.user ? toWorkPersonRef(row.user) : null,
      fromDay: row.fromDay,
      toDay: row.toDay,
      days: workDaysInclusive(row.fromDay, row.toDay),
      minutesPerDay: row.minutesPerDay,
      reason: row.reason,
      status: row.status,
      maxCostMinor:
        finance || mine
          ? workOvertimeRequestMaxCost(
              row.minutesPerDay,
              row.fromDay,
              row.toDay,
              board.overtimeRateMinor,
            )
          : null,
      decidedBy: row.decidedBy ? toWorkPersonRef(row.decidedBy) : null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      createdAt: row.createdAt.toISOString(),
      mine,
    };
  }

  /**
   * Запросы доски (VED-459): ведущему и администрации — все, ждущие сверху;
   * исполнителю — свои. Решённые — последние полсотни: это журнал, а не архив.
   */
  async overtimeRequests(
    boardId: string,
    userId: string,
  ): Promise<WorkOvertimeRequestsDto> {
    const board = await this.prisma.workBoard.findUnique({
      where: { id: boardId },
      select: boardRulesSelect,
    });
    const context = await this.contextOfBoard(board, userId);
    const scope = context.finance ? {} : { userId };
    const [pending, decided] = await Promise.all([
      this.prisma.workOvertimeRequest.findMany({
        where: { boardId, status: 'pending', ...scope },
        orderBy: { createdAt: 'asc' },
        include: overtimeRequestInclude,
      }),
      this.prisma.workOvertimeRequest.findMany({
        where: { boardId, status: { not: 'pending' }, ...scope },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: overtimeRequestInclude,
      }),
    ]);
    return {
      currency: context.board.currency as WorkCurrency,
      canDecide: context.finance,
      items: [...pending, ...decided].map((row) =>
        this.toRequestDto(row, context.board, userId, context.finance),
      ),
    };
  }

  /** Попросить часы сверх нормы по задаче. Решает ведущий. */
  async requestOvertime(
    taskId: string,
    userId: string,
    request: CreateWorkOvertimeRequest,
    now = new Date(),
  ): Promise<WorkTaskFinanceDto> {
    const { board, role } = await this.taskContext(taskId, userId);
    assertWorkAccess(role, 'editTask');
    if (!overtimeNeedsRequest(board)) {
      throw new BadRequestException(
        'На этой доске часы сверх нормы не требуют одобрения',
      );
    }
    const data = parseWorkOvertimeRequest(
      request,
      workLocalDay(now, board.timezone),
    );
    const created = await this.prisma.workOvertimeRequest.create({
      data: { boardId: board.id, taskId, userId, ...data },
      select: { id: true },
    });
    await this.notifyRequested(created.id, board, userId);
    return this.taskFinance(taskId, userId, now);
  }

  /** Решение ведущего. Свой запрос решает другой — кроме владельца среды. */
  async decideOvertime(
    requestId: string,
    userId: string,
    request: DecideWorkOvertimeRequest,
  ): Promise<WorkOvertimeRequestsDto> {
    const row = await this.prisma.workOvertimeRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        userId: true,
        board: { select: boardRulesSelect },
      },
    });
    if (!row) throw new NotFoundException('Запрос не найден');
    const context = await this.contextOfBoard(row.board, userId);
    this.assertFinance(context);
    if (row.userId === userId && context.role !== 'owner') {
      throw new ForbiddenException(
        'Свой запрос одобряет другой ведущий или владелец среды',
      );
    }
    if (request?.decision !== 'approved' && request?.decision !== 'rejected') {
      throw new BadRequestException('Решение: approved или rejected');
    }
    const note = optionalText(
      request.note,
      'Пояснение',
      WORK_OVERTIME_REASON_MAX,
    );
    // Решить можно только ждущий запрос; двойное нажатие у двух ведущих
    // не переигрывает первое решение.
    const updated = await this.prisma.workOvertimeRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: request.decision,
        decidedById: userId,
        decidedAt: new Date(),
        decisionNote: note,
      },
    });
    if (updated.count === 0) {
      throw new BadRequestException('Запрос уже решён или отменён');
    }
    await this.notifyDecided(requestId, userId);
    return this.overtimeRequests(row.board.id, userId);
  }

  /** Отозвать свой ждущий запрос. */
  async cancelOvertime(
    requestId: string,
    userId: string,
  ): Promise<WorkOvertimeRequestsDto> {
    const row = await this.prisma.workOvertimeRequest.findUnique({
      where: { id: requestId },
      select: { userId: true, boardId: true },
    });
    if (!row || row.userId !== userId) {
      throw new NotFoundException('Запрос не найден');
    }
    const updated = await this.prisma.workOvertimeRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (updated.count === 0) {
      throw new BadRequestException('Запрос уже решён');
    }
    return this.overtimeRequests(row.boardId, userId);
  }

  /** Всё для уведомления — в событие: подписчик наши таблицы не читает. */
  private async requestContext(requestId: string) {
    return this.prisma.workOvertimeRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        userId: true,
        fromDay: true,
        toDay: true,
        minutesPerDay: true,
        status: true,
        decisionNote: true,
        user: { select: { name: true, spiritualName: true } },
        decidedBy: { select: { name: true, spiritualName: true } },
        task: {
          select: { number: true, title: true },
        },
        board: {
          select: {
            leadId: true,
            space: { select: { id: true, name: true, prefix: true } },
          },
        },
      },
    });
  }

  private async notifyRequested(
    requestId: string,
    board: BoardRulesRow,
    actorId: string,
  ): Promise<void> {
    const ctx = await this.requestContext(requestId);
    if (!ctx) return;
    // Ведущему; если ведущего нет или просит он сам — владельцу среды.
    let recipientId = board.leadId;
    if (!recipientId || recipientId === actorId) {
      const space = await this.prisma.workSpace.findUnique({
        where: { id: board.spaceId },
        select: { ownerId: true },
      });
      recipientId = space?.ownerId ?? null;
    }
    if (!recipientId || recipientId === actorId) return;
    const space = ctx.board.space;
    this.events.emit(WORK_EVENTS.overtimeRequested, {
      name: WORK_EVENTS.overtimeRequested,
      recipientId,
      requestId,
      spaceId: space.id,
      spaceName: space.name,
      taskKey: ctx.task ? workTaskKey(space.prefix, ctx.task.number) : null,
      taskTitle: ctx.task?.title ?? null,
      actorName: ctx.user ? resolveDisplayName(ctx.user) : 'Участник',
      minutesPerDay: ctx.minutesPerDay,
      fromDay: ctx.fromDay,
      toDay: ctx.toDay,
    });
  }

  private async notifyDecided(
    requestId: string,
    actorId: string,
  ): Promise<void> {
    const ctx = await this.requestContext(requestId);
    if (!ctx?.userId || ctx.userId === actorId) return;
    if (ctx.status !== 'approved' && ctx.status !== 'rejected') return;
    const space = ctx.board.space;
    this.events.emit(WORK_EVENTS.overtimeDecided, {
      name: WORK_EVENTS.overtimeDecided,
      recipientId: ctx.userId,
      requestId,
      spaceId: space.id,
      spaceName: space.name,
      taskKey: ctx.task ? workTaskKey(space.prefix, ctx.task.number) : null,
      taskTitle: ctx.task?.title ?? null,
      actorName: ctx.decidedBy ? resolveDisplayName(ctx.decidedBy) : 'Ведущий',
      decision: ctx.status,
      minutesPerDay: ctx.minutesPerDay,
      fromDay: ctx.fromDay,
      toDay: ctx.toDay,
      note: ctx.decisionNote,
    });
  }
}
