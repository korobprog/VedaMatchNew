import type {
  WorkPayoutCorrection,
  WorkPayoutPeriodKind,
  WorkPayoutSnapshot,
} from '@vedamatch/shared';
import { assertWorkPayoutDay } from './work-finance-settings';
import {
  type WorkFinanceRules,
  type WorkSpanSplit,
  workBilledOvertime,
  workLocalDay,
  workMinutesCost,
  workSpanCost,
} from './work-finance';

/**
 * Календарь выплат коммерческой доски (VED-460) — чистый расчёт без базы.
 *
 * Период не хранится заранее: текущий начинается на следующий день после
 * последнего закрытого и кончается ближайшим днём подбития. Подбить раньше
 * можно — тогда следующий период начнётся на день раньше, а расписание не
 * сдвинется: день подбития считается от календаря, а не от прошлого периода.
 *
 * Дни — строками `2026-09-24` в поясе доски: сравнение строк — сравнение дат.
 */

export interface WorkPayoutSchedule {
  period: WorkPayoutPeriodKind;
  /** Неделя и две недели — день недели ISO (1 = понедельник, 7 = воскресенье);
   *  месяц — число 1…28 (29-го бывает не в каждом месяце). */
  payoutDay: number;
  /** Две недели: один из дней подбития, от него считается чётность недель. */
  anchorDay: string;
}

const DAY_MS = 86_400_000;

function toUtc(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function workAddDays(day: string, days: number): string {
  return fromUtc(toUtc(day) + days * DAY_MS);
}

/** День недели ISO: понедельник — 1, воскресенье — 7. */
export function workWeekday(day: string): number {
  const weekday = new Date(toUtc(day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Ближайший день подбития не раньше `day`. */
export function workNextPayoutDay(
  day: string,
  schedule: WorkPayoutSchedule,
): string {
  if (schedule.period === 'monthly') {
    const [year, month, date] = day.split('-').map(Number);
    const target = Math.min(Math.max(schedule.payoutDay, 1), 28);
    return date <= target
      ? fromUtc(Date.UTC(year, month - 1, target))
      : fromUtc(Date.UTC(year, month, target));
  }
  const shift = (schedule.payoutDay - workWeekday(day) + 7) % 7;
  const candidate = workAddDays(day, shift);
  if (schedule.period === 'weekly') return candidate;
  // Две недели: подходит только день, отстоящий от якоря на чётное число
  // недель. Якорь сам — день подбития, поэтому разница кратна семи.
  const weeks = Math.round(
    (toUtc(candidate) - toUtc(schedule.anchorDay)) / (7 * DAY_MS),
  );
  return weeks % 2 === 0 ? candidate : workAddDays(candidate, 7);
}

/** Текущий (незакрытый) период: с дня после прошлого закрытого по день подбития. */
export function workCurrentPeriod(
  lastClosedToDay: string | null,
  sinceDay: string,
  schedule: WorkPayoutSchedule,
): { fromDay: string; toDay: string } {
  const fromDay = lastClosedToDay ? workAddDays(lastClosedToDay, 1) : sinceDay;
  return { fromDay, toDay: workNextPayoutDay(fromDay, schedule) };
}

/** Период пора подбивать: его день подбития уже прошёл целиком. */
export function workPeriodDue(toDay: string, today: string): boolean {
  return today > toDay;
}

export interface WorkPayoutEntryInput {
  userId: string | null;
  personName: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  /** День начала записи в поясе доски. */
  day: string;
  split: WorkSpanSplit;
}

export interface WorkPayoutLateApprovalInput {
  userId: string | null;
  personName: string;
  taskKey: string;
  day: string;
  /** Сколько минут сверх нормы одобрили уже после закрытия того периода. */
  minutes: number;
}

export interface WorkPayoutLineInput {
  taskId: string;
  taskKey: string;
  taskTitle: string;
  kind: 'expense' | 'discount';
  amountMinor: number;
}

export interface WorkPayoutPriceInput {
  taskId: string;
  taskKey: string;
  taskTitle: string;
  priceMinor: number;
}

/**
 * Подбитие периода: кому сколько, что сделано, какие корректировки. Записи,
 * начатые до периода, — это время, внесённое задним числом в уже закрытые
 * дни: они считаются здесь и помечаются корректировкой, чтобы подбитие,
 * которое клиент уже видел, не менялось.
 */
export function workBuildPayout(input: {
  fromDay: string;
  rules: WorkFinanceRules;
  entries: WorkPayoutEntryInput[];
  lateApprovals: WorkPayoutLateApprovalInput[];
  lines: WorkPayoutLineInput[];
  prices: WorkPayoutPriceInput[];
  /** Задачи, закрытые в периоде: в «сделано» они с галочкой. */
  doneTaskIds: Set<string>;
}): WorkPayoutSnapshot {
  const { rules } = input;
  const people = new Map<string, WorkPayoutSnapshot['people'][number]>();
  const tasks = new Map<string, WorkPayoutSnapshot['tasks'][number]>();
  const corrections: WorkPayoutCorrection[] = [];

  const person = (userId: string | null, name: string) => {
    const key = userId ?? '';
    let row = people.get(key);
    if (!row) {
      row = {
        userId,
        name,
        minutes: 0,
        normalMinutes: 0,
        overtimeMinutes: 0,
        pendingOvertimeMinutes: 0,
        workMinor: 0,
      };
      people.set(key, row);
    }
    return row;
  };
  const task = (taskId: string, key: string, title: string) => {
    let row = tasks.get(taskId);
    if (!row) {
      row = {
        taskId,
        key,
        title,
        done: input.doneTaskIds.has(taskId),
        minutes: 0,
        workMinor: 0,
        expensesMinor: 0,
        discountMinor: 0,
      };
      tasks.set(taskId, row);
    }
    return row;
  };

  for (const entry of input.entries) {
    const billed = workBilledOvertime(entry.split, rules);
    const cost = workSpanCost(entry.split, rules);
    const who = person(entry.userId, entry.personName);
    who.minutes += entry.split.minutes;
    who.normalMinutes += entry.split.normalMinutes;
    who.overtimeMinutes += billed;
    who.pendingOvertimeMinutes += entry.split.overtimeMinutes - billed;
    who.workMinor += cost;
    const what = task(entry.taskId, entry.taskKey, entry.taskTitle);
    what.minutes += entry.split.minutes;
    what.workMinor += cost;
    if (entry.day < input.fromDay) {
      corrections.push({
        kind: 'late_time',
        userId: entry.userId,
        name: entry.personName,
        taskKey: entry.taskKey,
        day: entry.day,
        minutes: entry.split.minutes,
        amountMinor: cost,
      });
    }
  }

  let correctionsMinor = 0;
  for (const late of input.lateApprovals) {
    if (late.minutes <= 0) continue;
    const amount =
      rules.pricingModel === 'hourly'
        ? workMinutesCost(late.minutes, rules.overtimeRateMinor)
        : 0;
    correctionsMinor += amount;
    const who = person(late.userId, late.personName);
    who.overtimeMinutes += late.minutes;
    who.workMinor += amount;
    corrections.push({
      kind: 'late_approval',
      userId: late.userId,
      name: late.personName,
      taskKey: late.taskKey,
      day: late.day,
      minutes: late.minutes,
      amountMinor: amount,
    });
  }

  for (const price of input.prices) {
    task(price.taskId, price.taskKey, price.taskTitle).workMinor +=
      price.priceMinor;
  }
  for (const line of input.lines) {
    const what = task(line.taskId, line.taskKey, line.taskTitle);
    if (line.kind === 'expense') what.expensesMinor += line.amountMinor;
    else what.discountMinor += line.amountMinor;
  }

  const taskRows = [...tasks.values()].sort((a, b) =>
    a.key.localeCompare(b.key, 'ru', { numeric: true }),
  );
  const peopleRows = [...people.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'ru'),
  );
  const sum = <T>(rows: T[], pick: (row: T) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const workMinor = sum(taskRows, (row) => row.workMinor) + correctionsMinor;
  const expensesMinor = sum(taskRows, (row) => row.expensesMinor);
  const discountMinor = sum(taskRows, (row) => row.discountMinor);

  return {
    people: peopleRows,
    tasks: taskRows,
    corrections,
    totals: {
      minutes: sum(peopleRows, (row) => row.minutes),
      normalMinutes: sum(peopleRows, (row) => row.normalMinutes),
      overtimeMinutes: sum(peopleRows, (row) => row.overtimeMinutes),
      pendingOvertimeMinutes: sum(
        peopleRows,
        (row) => row.pendingOvertimeMinutes,
      ),
      workMinor,
      expensesMinor,
      discountMinor,
      correctionsMinor,
      totalMinor: Math.max(0, workMinor + expensesMinor - discountMinor),
    },
  };
}

/**
 * Поля расписания для записи в доску. Сменили период или день — якорь «двух
 * недель» ставится на ближайший день подбития от сегодня: следующее подбитие
 * придётся на него, а не через неделю.
 */
export function workPayoutScheduleData(
  change: { payoutPeriod?: WorkPayoutPeriodKind; payoutDay?: number },
  current: {
    payoutPeriod: WorkPayoutPeriodKind;
    payoutDay: number;
    timezone: string;
  },
  now: Date,
): { payoutAnchorDay?: string } {
  if (change.payoutPeriod === undefined && change.payoutDay === undefined) {
    return {};
  }
  const period = change.payoutPeriod ?? current.payoutPeriod;
  const payoutDay = change.payoutDay ?? current.payoutDay;
  assertWorkPayoutDay(period, payoutDay);
  const today = workLocalDay(now, current.timezone);
  return {
    payoutAnchorDay:
      period === 'biweekly'
        ? workNextPayoutDay(today, {
            period: 'weekly',
            payoutDay,
            anchorDay: today,
          })
        : '',
  };
}
