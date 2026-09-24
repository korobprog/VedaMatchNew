import type { WorkPayoutActDto, WorkPayoutSnapshot } from '@vedamatch/shared';

const DAY_MS = 86_400_000;

/**
 * Строки и итог акта для клиента (VED-461) из замороженного итога периода.
 * Кому сколько из исполнителей клиенту не показываем — только что сделано и
 * сколько это стоит. Доплата за одобренное задним числом — отдельной строкой,
 * а не размазана по задачам: иначе клиент не поймёт, откуда разница.
 */
export function workActFromSnapshot(
  snapshot: WorkPayoutSnapshot,
): Pick<WorkPayoutActDto, 'lines' | 'correctionsMinor' | 'totals'> {
  const lines = snapshot.tasks.map((task) => ({
    key: task.key,
    title: task.title,
    done: task.done,
    minutes: task.minutes,
    workMinor: task.workMinor,
    expensesMinor: task.expensesMinor,
    discountMinor: task.discountMinor,
    totalMinor: Math.max(
      0,
      task.workMinor + task.expensesMinor - task.discountMinor,
    ),
  }));
  return {
    lines,
    correctionsMinor: snapshot.totals.correctionsMinor,
    totals: {
      minutes: snapshot.totals.minutes,
      workMinor: snapshot.totals.workMinor,
      expensesMinor: snapshot.totals.expensesMinor,
      discountMinor: snapshot.totals.discountMinor,
      totalMinor: snapshot.totals.totalMinor,
    },
  };
}

/**
 * Пора ли напомнить ведущему о неоплаченном периоде: прошло `days` полных
 * суток с подбития и столько же с прошлого напоминания. Ноль — не напоминать.
 * Пустой период (к оплате ноль) не напоминается никогда.
 */
export function workReminderDue(input: {
  days: number;
  closedAt: Date;
  remindedAt: Date | null;
  totalMinor: number;
  now: Date;
}): boolean {
  if (input.days <= 0 || input.totalMinor <= 0) return false;
  const since = input.remindedAt ?? input.closedAt;
  return input.now.getTime() - since.getTime() >= input.days * DAY_MS;
}

/** Полных суток с подбития — для текста напоминания. */
export function workDaysSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}
