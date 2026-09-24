import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import {
  WORK_PAYOUT_NOTE_MAX,
  resolveDisplayName,
  type MarkWorkPayoutRequest,
  type WorkCurrency,
  type WorkPayoutActDto,
  type WorkPayoutShareDto,
  type WorkPayoutPeriodDto,
  type WorkPayoutSnapshot,
  type WorkPayoutsDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  workActFromSnapshot,
  workDaysSince,
  workReminderDue,
} from './work-act';
import { WORK_EVENTS } from './work-events';
import {
  workBilledOvertime,
  workLocalDay,
  workLocalDayStart,
} from './work-finance';
import {
  WorkFinanceService,
  boardRulesSelect,
  rulesOf,
  spanEnd,
} from './work-finance.service';
import {
  type WorkPayoutSchedule,
  workAddDays,
  workBuildPayout,
  workCurrentPeriod,
  workPeriodDue,
} from './work-payout';
import { optionalText, workTaskKey } from './work-validate';

/** Сколько дней назад искать одобрения сверх нормы, пришедшие после подбития. */
const LATE_APPROVAL_LOOKBACK_DAYS = 62;
/** Сколько подбитых периодов показывать: журнал, а не архив. */
const CLOSED_LIMIT = 26;
/** Сколько пропущенных периодов воркер догоняет за один проход по доске. */
const CATCH_UP_LIMIT = 12;

const payoutBoardSelect = {
  ...boardRulesSelect,
  payoutPeriod: true,
  payoutDay: true,
  payoutAnchorDay: true,
  commercialSince: true,
  paymentReminderDays: true,
  space: { select: { id: true, name: true, prefix: true } },
} satisfies Prisma.WorkBoardSelect;

type PayoutBoardRow = Prisma.WorkBoardGetPayload<{
  select: typeof payoutBoardSelect;
}>;

function scheduleOf(board: PayoutBoardRow): WorkPayoutSchedule {
  return {
    period: board.payoutPeriod,
    payoutDay: board.payoutDay,
    anchorDay:
      board.payoutAnchorDay ||
      workLocalDay(board.commercialSince, board.timezone),
  };
}

const nameSelect = { name: true, spiritualName: true } as const;

/**
 * Для того, кто не видит деньги доски: его строка, его корректировки, задачи
 * без сумм, итог — его сумма.
 */
export function workPayoutForViewer(
  snapshot: WorkPayoutSnapshot,
  viewerId: string,
): WorkPayoutSnapshot {
  const people = snapshot.people.filter((row) => row.userId === viewerId);
  const own = people[0]?.workMinor ?? 0;
  return {
    people,
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      workMinor: 0,
      expensesMinor: 0,
      discountMinor: 0,
    })),
    corrections: snapshot.corrections.filter((row) => row.userId === viewerId),
    totals: {
      ...snapshot.totals,
      minutes: people[0]?.minutes ?? 0,
      normalMinutes: people[0]?.normalMinutes ?? 0,
      overtimeMinutes: people[0]?.overtimeMinutes ?? 0,
      pendingOvertimeMinutes: people[0]?.pendingOvertimeMinutes ?? 0,
      workMinor: own,
      expensesMinor: 0,
      discountMinor: 0,
      correctionsMinor: 0,
      totalMinor: own,
    },
  };
}

/**
 * Календарь выплат и подбитие (VED-460). Идущий период считается на лету;
 * подбитый хранит замороженный итог и привязывает к себе записи, строки сметы
 * и цены — так поздняя правка не меняет то, что клиент уже видел.
 */
@Injectable()
export class WorkPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: WorkFinanceService,
    private readonly events: EventEmitter2,
  ) {}

  private async loadBoard(boardId: string): Promise<PayoutBoardRow> {
    const board = await this.prisma.workBoard.findUnique({
      where: { id: boardId },
      select: payoutBoardSelect,
    });
    if (!board) throw new NotFoundException('Доска не найдена');
    return board;
  }

  private async currentPeriod(board: PayoutBoardRow) {
    const last = await this.prisma.workPayoutPeriod.findFirst({
      where: { boardId: board.id },
      orderBy: { toDay: 'desc' },
      select: { toDay: true },
    });
    return workCurrentPeriod(
      last?.toDay ?? null,
      workLocalDay(board.commercialSince, board.timezone),
      scheduleOf(board),
    );
  }

  /**
   * Всё, что войдёт в период, заканчивающийся `toDay`: неподбитые записи по
   * этот день включительно (и более ранние — это время задним числом), строки
   * сметы и цены закрытых задач, доплаты за сверх нормы, одобренное позже.
   */
  private async gather(
    board: PayoutBoardRow,
    fromDay: string,
    toDay: string,
    now: Date,
  ) {
    const rules = rulesOf(board);
    const end = workLocalDayStart(workAddDays(toDay, 1), board.timezone);
    const start = workLocalDayStart(fromDay, board.timezone);
    const taskSelect = { id: true, number: true, title: true } as const;
    const [entries, closedEntries, lines, prices, done] = await Promise.all([
      this.prisma.workTimeEntry.findMany({
        where: {
          boardId: board.id,
          payoutPeriodId: null,
          endedAt: { not: null },
          startedAt: { lt: end },
        },
        include: { user: { select: nameSelect }, task: { select: taskSelect } },
      }),
      rules.pricingModel === 'hourly' && rules.overtimeMode === 'on_request'
        ? this.prisma.workTimeEntry.findMany({
            where: {
              boardId: board.id,
              payoutPeriodId: { not: null },
              startedAt: {
                gte: new Date(
                  now.getTime() - LATE_APPROVAL_LOOKBACK_DAYS * 86_400_000,
                ),
              },
            },
            include: {
              user: { select: nameSelect },
              task: { select: taskSelect },
            },
          })
        : Promise.resolve([]),
      this.prisma.workTaskLineItem.findMany({
        where: {
          payoutPeriodId: null,
          createdAt: { lt: end },
          task: { boardId: board.id },
        },
        include: { task: { select: taskSelect } },
      }),
      rules.pricingModel === 'fixed'
        ? this.prisma.workTask.findMany({
            where: {
              boardId: board.id,
              priceMinor: { not: null },
              completedAt: { not: null, lt: end },
              pricePayoutPeriodId: null,
            },
            select: { ...taskSelect, priceMinor: true },
          })
        : Promise.resolve([]),
      this.prisma.workTask.findMany({
        where: { boardId: board.id, completedAt: { gte: start, lt: end } },
        select: { id: true },
      }),
    ]);

    const spanOf = (row: {
      id: string;
      userId: string | null;
      startedAt: Date;
      endedAt: Date | null;
    }) => ({
      id: row.id,
      userId: row.userId,
      startedAt: row.startedAt,
      endedAt: spanEnd(row.startedAt, row.endedAt, now),
    });
    const splits = await this.finance.splitsFor(
      board,
      [...entries, ...closedEntries].map(spanOf),
      now,
    );
    const key = (number: number) => workTaskKey(board.space.prefix, number);
    const nameOf = (
      user: { name: string; spiritualName: string | null } | null,
    ) => (user ? resolveDisplayName(user) : 'Удалённый участник');

    const lateApprovals: Array<{
      entryId: string;
      approved: number;
      input: Parameters<typeof workBuildPayout>[0]['lateApprovals'][number];
    }> = [];
    for (const row of closedEntries) {
      const split = splits.get(row.id);
      if (!split) continue;
      const approved = workBilledOvertime(split, rules);
      const billed = row.billedOvertimeMinutes ?? 0;
      if (approved > billed) {
        lateApprovals.push({
          entryId: row.id,
          approved,
          input: {
            userId: row.userId,
            personName: nameOf(row.user),
            taskKey: key(row.task.number),
            day: workLocalDay(row.startedAt, board.timezone),
            minutes: approved - billed,
          },
        });
      }
    }

    const snapshot = workBuildPayout({
      fromDay,
      rules,
      entries: entries.map((row) => ({
        userId: row.userId,
        personName: nameOf(row.user),
        taskId: row.task.id,
        taskKey: key(row.task.number),
        taskTitle: row.task.title,
        day: workLocalDay(row.startedAt, board.timezone),
        split: splits.get(row.id) ?? {
          minutes: 0,
          normalMinutes: 0,
          overtimeMinutes: 0,
          approvedOvertimeMinutes: 0,
        },
      })),
      lateApprovals: lateApprovals.map((late) => late.input),
      lines: lines.map((line) => ({
        taskId: line.task.id,
        taskKey: key(line.task.number),
        taskTitle: line.task.title,
        kind: line.kind,
        amountMinor: line.amountMinor,
      })),
      prices: prices.map((task) => ({
        taskId: task.id,
        taskKey: key(task.number),
        taskTitle: task.title,
        priceMinor: task.priceMinor ?? 0,
      })),
      doneTaskIds: new Set(done.map((task) => task.id)),
    });
    return {
      snapshot,
      entryBilling: entries.map((row) => ({
        id: row.id,
        billed: workBilledOvertime(
          splits.get(row.id) ?? {
            minutes: 0,
            normalMinutes: 0,
            overtimeMinutes: 0,
            approvedOvertimeMinutes: 0,
          },
          rules,
        ),
      })),
      lateApprovals,
      lineIds: lines.map((line) => line.id),
      priceTaskIds: prices.map((task) => task.id),
    };
  }

  private toDto(
    row: {
      id: string;
      fromDay: string;
      toDay: string;
      status: 'closed' | 'sent' | 'paid';
      snapshot: Prisma.JsonValue;
      closedAt: Date;
      sentAt: Date | null;
      paidAt: Date | null;
      paidNote: string;
      actToken: string | null;
    },
    viewerId: string,
    finance: boolean,
  ): WorkPayoutPeriodDto {
    const snapshot = row.snapshot as unknown as WorkPayoutSnapshot;
    return {
      id: row.id,
      fromDay: row.fromDay,
      toDay: row.toDay,
      status: row.status,
      snapshot: finance ? snapshot : workPayoutForViewer(snapshot, viewerId),
      closedAt: row.closedAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      paidAt: row.paidAt?.toISOString() ?? null,
      paidNote: row.paidNote,
      // Ссылка на акт — ключ без входа: исполнителю её не отдаём.
      actToken: finance ? row.actToken : null,
    };
  }

  /** Календарь выплат: идущий период на сейчас и подбитые. */
  async payouts(
    boardId: string,
    userId: string,
    now = new Date(),
  ): Promise<WorkPayoutsDto> {
    const board = await this.loadBoard(boardId);
    const context = await this.finance.contextOfBoard(board, userId);
    // Воркер ходит раз в пять минут; открыли календарь раньше — просроченное
    // подбивается сейчас, чтобы «идущим» не показывался прошедший период.
    await this.closeDueBoard(board, now);
    const period = await this.currentPeriod(board);
    const [{ snapshot }, closed] = await Promise.all([
      this.gather(board, period.fromDay, period.toDay, now),
      this.prisma.workPayoutPeriod.findMany({
        where: { boardId },
        orderBy: { toDay: 'desc' },
        take: CLOSED_LIMIT,
      }),
    ]);
    return {
      currency: board.currency as WorkCurrency,
      period: board.payoutPeriod,
      payoutDay: board.payoutDay,
      canManage: context.finance,
      current: {
        id: null,
        ...period,
        status: 'open',
        snapshot: context.finance
          ? snapshot
          : workPayoutForViewer(snapshot, userId),
        closedAt: null,
        sentAt: null,
        paidAt: null,
        paidNote: '',
        actToken: null,
      },
      closed: closed.map((row) => this.toDto(row, userId, context.finance)),
    };
  }

  /** Подбить идущий период сейчас — ведущий, не дожидаясь дня подбития. */
  async closeNow(
    boardId: string,
    userId: string,
    now = new Date(),
  ): Promise<WorkPayoutsDto> {
    const board = await this.loadBoard(boardId);
    const context = await this.finance.contextOfBoard(board, userId);
    if (!context.finance) {
      throw new ForbiddenException(
        'Подбивает ведущий доски или администрация среды',
      );
    }
    const period = await this.currentPeriod(board);
    const today = workLocalDay(now, board.timezone);
    if (today < period.fromDay) {
      throw new BadRequestException('Период ещё не начался');
    }
    const toDay = today < period.toDay ? today : period.toDay;
    await this.close(board, period.fromDay, toDay, now);
    return this.payouts(boardId, userId, now);
  }

  /**
   * Закрыть период: заморозить итог и привязать к нему всё, что в него
   * вошло. Уникальность (доска, начало) не даёт двум инстансам подбить одно
   * и то же — второй получит ошибку и ничего не изменит.
   */
  async close(
    board: PayoutBoardRow,
    fromDay: string,
    toDay: string,
    now: Date,
  ): Promise<string | null> {
    const data = await this.gather(board, fromDay, toDay, now);
    const periodId = await this.prisma
      .$transaction(async (tx) => {
        const period = await tx.workPayoutPeriod.create({
          data: {
            boardId: board.id,
            fromDay,
            toDay,
            snapshot: data.snapshot as unknown as Prisma.InputJsonValue,
            totalMinor: data.snapshot.totals.totalMinor,
            closedAt: now,
          },
          select: { id: true },
        });
        for (const entry of data.entryBilling) {
          await tx.workTimeEntry.update({
            where: { id: entry.id },
            data: {
              payoutPeriodId: period.id,
              billedOvertimeMinutes: entry.billed,
            },
          });
        }
        for (const late of data.lateApprovals) {
          await tx.workTimeEntry.update({
            where: { id: late.entryId },
            data: { billedOvertimeMinutes: late.approved },
          });
        }
        if (data.lineIds.length > 0) {
          await tx.workTaskLineItem.updateMany({
            where: { id: { in: data.lineIds } },
            data: { payoutPeriodId: period.id },
          });
        }
        if (data.priceTaskIds.length > 0) {
          await tx.workTask.updateMany({
            where: { id: { in: data.priceTaskIds } },
            data: { pricePayoutPeriodId: period.id },
          });
        }
        return period.id;
      })
      .catch((error: unknown) => {
        if ((error as { code?: string })?.code === 'P2002') return null;
        throw error;
      });
    if (periodId)
      this.notifyClosed(board, periodId, fromDay, toDay, data.snapshot);
    return periodId;
  }

  private notifyClosed(
    board: PayoutBoardRow,
    periodId: string,
    fromDay: string,
    toDay: string,
    snapshot: WorkPayoutSnapshot,
  ): void {
    const base = {
      periodId,
      spaceId: board.space.id,
      spaceName: board.space.name,
      fromDay,
      toDay,
      currency: board.currency,
    };
    // Пустая неделя — не новость: ни часов, ни денег.
    if (snapshot.totals.minutes === 0 && snapshot.totals.totalMinor === 0) {
      return;
    }
    if (board.leadId) {
      this.events.emit(WORK_EVENTS.payoutClosed, {
        name: WORK_EVENTS.payoutClosed,
        recipientId: board.leadId,
        amountMinor: snapshot.totals.totalMinor,
        role: 'lead',
        ...base,
      });
    }
    for (const person of snapshot.people) {
      if (!person.userId || person.userId === board.leadId) continue;
      if (person.workMinor <= 0) continue;
      this.events.emit(WORK_EVENTS.payoutClosed, {
        name: WORK_EVENTS.payoutClosed,
        recipientId: person.userId,
        amountMinor: person.workMinor,
        role: 'executor',
        ...base,
      });
    }
  }

  /** Отметить подбитый период отправленным клиенту или оплаченным. */
  async mark(
    periodId: string,
    userId: string,
    request: MarkWorkPayoutRequest,
  ): Promise<WorkPayoutsDto> {
    const period = await this.prisma.workPayoutPeriod.findUnique({
      where: { id: periodId },
      select: {
        id: true,
        boardId: true,
        status: true,
        fromDay: true,
        toDay: true,
        snapshot: true,
      },
    });
    if (!period) throw new NotFoundException('Период не найден');
    const board = await this.loadBoard(period.boardId);
    const context = await this.finance.contextOfBoard(board, userId);
    if (!context.finance) {
      throw new ForbiddenException(
        'Оплату отмечает ведущий доски или администрация среды',
      );
    }
    const status = request?.status;
    if (status !== 'sent' && status !== 'paid') {
      throw new BadRequestException('Статус: sent или paid');
    }
    if (period.status === 'paid') {
      throw new BadRequestException('Период уже оплачен');
    }
    if (status === 'sent' && period.status !== 'closed') {
      throw new BadRequestException('Итог уже отправлен');
    }
    const note = optionalText(request.note, 'Пояснение', WORK_PAYOUT_NOTE_MAX);
    const now = new Date();
    await this.prisma.workPayoutPeriod.update({
      where: { id: periodId },
      data:
        status === 'sent'
          ? { status, sentAt: now }
          : { status, paidAt: now, paidNote: note },
    });
    if (status === 'paid') {
      const snapshot = period.snapshot as unknown as WorkPayoutSnapshot;
      for (const person of snapshot.people) {
        if (!person.userId || person.userId === userId) continue;
        if (person.workMinor <= 0) continue;
        this.events.emit(WORK_EVENTS.payoutPaid, {
          name: WORK_EVENTS.payoutPaid,
          recipientId: person.userId,
          periodId,
          spaceId: board.space.id,
          spaceName: board.space.name,
          fromDay: period.fromDay,
          toDay: period.toDay,
          amountMinor: person.workMinor,
          currency: board.currency,
        });
      }
    }
    return this.payouts(board.id, userId);
  }

  /**
   * Проход воркера: у каждой коммерческой доски подбить периоды, чей день
   * подбития прошёл. Доска, простоявшая месяц без воркера, догоняется
   * неделями по порядку, а не одним куском.
   */
  async closeDue(now = new Date()): Promise<number> {
    const boards = await this.prisma.workBoard.findMany({
      where: { kind: 'commercial', archivedAt: null },
      select: payoutBoardSelect,
    });
    let closed = 0;
    for (const board of boards) {
      closed += await this.closeDueBoard(board, now);
      await this.remindBoard(board, now);
    }
    return closed;
  }

  /**
   * Напомнить ведущему о подбитых, но не оплаченных периодах (VED-461).
   * Отметка `remindedAt` ставится через `updateMany` с проверкой прежнего
   * значения — два инстанса не напомнят дважды.
   */
  private async remindBoard(board: PayoutBoardRow, now: Date): Promise<void> {
    if (board.paymentReminderDays <= 0 || !board.leadId) return;
    const unpaid = await this.prisma.workPayoutPeriod.findMany({
      where: { boardId: board.id, status: { in: ['closed', 'sent'] } },
      select: {
        id: true,
        fromDay: true,
        toDay: true,
        closedAt: true,
        remindedAt: true,
        totalMinor: true,
      },
    });
    for (const period of unpaid) {
      if (
        !workReminderDue({
          days: board.paymentReminderDays,
          closedAt: period.closedAt,
          remindedAt: period.remindedAt,
          totalMinor: period.totalMinor,
          now,
        })
      ) {
        continue;
      }
      const claimed = await this.prisma.workPayoutPeriod.updateMany({
        where: { id: period.id, remindedAt: period.remindedAt },
        data: { remindedAt: now },
      });
      if (claimed.count === 0) continue;
      this.events.emit(WORK_EVENTS.payoutReminder, {
        name: WORK_EVENTS.payoutReminder,
        recipientId: board.leadId,
        periodId: period.id,
        spaceId: board.space.id,
        spaceName: board.space.name,
        fromDay: period.fromDay,
        toDay: period.toDay,
        amountMinor: period.totalMinor,
        currency: board.currency,
        daysSinceClose: workDaysSince(period.closedAt, now),
      });
    }
  }

  /**
   * Ссылка на акт для клиента: секрет, по которому акт открывается без
   * входа. Повторный запрос возвращает ту же ссылку — уже отправленная
   * клиенту не должна переставать работать.
   */
  async share(periodId: string, userId: string): Promise<WorkPayoutShareDto> {
    const period = await this.prisma.workPayoutPeriod.findUnique({
      where: { id: periodId },
      select: { boardId: true, actToken: true },
    });
    if (!period) throw new NotFoundException('Период не найден');
    const board = await this.loadBoard(period.boardId);
    const context = await this.finance.contextOfBoard(board, userId);
    if (!context.finance) {
      throw new ForbiddenException(
        'Акт отправляет ведущий доски или администрация среды',
      );
    }
    if (period.actToken) return { token: period.actToken };
    const token = randomBytes(24).toString('base64url');
    await this.prisma.workPayoutPeriod.update({
      where: { id: periodId },
      data: { actToken: token },
    });
    return { token };
  }

  /** Закрыть ссылку на акт: старая перестаёт открываться. */
  async unshare(periodId: string, userId: string): Promise<WorkPayoutsDto> {
    const period = await this.prisma.workPayoutPeriod.findUnique({
      where: { id: periodId },
      select: { boardId: true },
    });
    if (!period) throw new NotFoundException('Период не найден');
    const board = await this.loadBoard(period.boardId);
    const context = await this.finance.contextOfBoard(board, userId);
    if (!context.finance) {
      throw new ForbiddenException(
        'Ссылку закрывает ведущий доски или администрация среды',
      );
    }
    await this.prisma.workPayoutPeriod.update({
      where: { id: periodId },
      data: { actToken: null },
    });
    return this.payouts(board.id, userId);
  }

  /** Акт по ссылке — без входа. Неизвестная ссылка неотличима от закрытой. */
  async publicAct(token: string): Promise<WorkPayoutActDto> {
    if (typeof token !== 'string' || token.length < 16) {
      throw new NotFoundException('Акт не найден');
    }
    const period = await this.prisma.workPayoutPeriod.findUnique({
      where: { actToken: token },
      select: {
        fromDay: true,
        toDay: true,
        status: true,
        closedAt: true,
        paidAt: true,
        snapshot: true,
        board: {
          select: {
            name: true,
            clientName: true,
            currency: true,
            pricingModel: true,
            kind: true,
            lead: { select: nameSelect },
            space: { select: { name: true } },
          },
        },
      },
    });
    if (!period || period.board.kind !== 'commercial') {
      throw new NotFoundException('Акт не найден');
    }
    return {
      spaceName: period.board.space.name,
      boardName: period.board.name,
      clientName: period.board.clientName,
      issuer: period.board.lead ? resolveDisplayName(period.board.lead) : null,
      currency: period.board.currency as WorkCurrency,
      pricingModel: period.board.pricingModel,
      fromDay: period.fromDay,
      toDay: period.toDay,
      closedAt: period.closedAt.toISOString(),
      status: period.status,
      paidAt: period.paidAt?.toISOString() ?? null,
      ...workActFromSnapshot(period.snapshot as unknown as WorkPayoutSnapshot),
    };
  }

  /** Подбить у доски все периоды, чей день подбития прошёл. */
  private async closeDueBoard(
    board: PayoutBoardRow,
    now: Date,
  ): Promise<number> {
    let closed = 0;
    for (let step = 0; step < CATCH_UP_LIMIT; step += 1) {
      const period = await this.currentPeriod(board);
      const today = workLocalDay(now, board.timezone);
      if (!workPeriodDue(period.toDay, today)) break;
      const id = await this.close(board, period.fromDay, period.toDay, now);
      if (!id) break;
      closed += 1;
    }
    return closed;
  }
}
