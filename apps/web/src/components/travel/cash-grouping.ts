import type { TravelCashEntryDto, TravelCashGrouping } from "@vedamatch/shared";

/**
 * Лента кассы по периодам. Чистая логика без React: итоги дня и нарастающий
 * остаток — это то, в чём хозяин хостела сверяется с деньгами в ящике, и
 * ошибка здесь дороже любой вёрстки. Все даты — `YYYY-MM-DD` в UTC, как их
 * отдаёт API: касса считается днями, а не часами браузера.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Самый длинный промежуток, который принимает API за один запрос. */
export const MAX_CASH_RANGE_DAYS = 1100;

export interface CashGroup {
  key: string;
  label: string;
  /** Остаток на начало периода. */
  startMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  /** Остаток на конец периода. */
  endMinor: number;
  /** Новые сверху, как в ленте. */
  entries: TravelCashEntryDto[];
}

function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Понедельник недели, в которую попадает день. */
function weekStart(date: Date): Date {
  // getUTCDay: 0 — воскресенье. Неделя в России начинается с понедельника.
  const shift = (date.getUTCDay() + 6) % 7;
  return addDays(date, -shift);
}

/** Ключ периода, в который попадает день. */
export function periodKey(day: string, grouping: TravelCashGrouping): string {
  switch (grouping) {
    case "day":
      return day;
    case "week":
      return formatDay(weekStart(parseDay(day)));
    case "month":
      return day.slice(0, 7);
    case "year":
      return day.slice(0, 4);
  }
}

const dayLabel = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayMonthLabel = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const monthLabel = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Подпись периода по его ключу. */
export function periodLabel(key: string, grouping: TravelCashGrouping): string {
  switch (grouping) {
    case "day":
      return dayLabel.format(parseDay(key));
    case "week": {
      const start = parseDay(key);
      const end = addDays(start, 6);
      return `${dayMonthLabel.format(start)} — ${dayMonthLabel.format(end)} ${end.getUTCFullYear()}`;
    }
    case "month": {
      // «май 2026 г.» → «Май 2026»: заголовок, а не дата в предложении.
      const text = monthLabel
        .format(parseDay(`${key}-01`))
        .replace(/\s*г\.$/, "");
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    case "year":
      return key;
  }
}

/**
 * Разложить записи по периодам и посчитать остатки.
 *
 * `balanceBeforeMinor` — остаток на утро первого дня запрошенного промежутка:
 * без него остаток первой группы начинался бы с нуля, а не с денег в кассе.
 * Внутри дня порядок записей — по времени внесения: так «остаток после»
 * совпадает с тем, как деньги реально приходили.
 */
export function groupCashEntries(
  entries: TravelCashEntryDto[],
  grouping: TravelCashGrouping,
  balanceBeforeMinor: number,
): CashGroup[] {
  const ascending = [...entries].sort(
    (a, b) =>
      a.occurredOn.localeCompare(b.occurredOn) ||
      a.createdAt.localeCompare(b.createdAt),
  );

  const groups: CashGroup[] = [];
  let balance = balanceBeforeMinor;
  for (const entry of ascending) {
    const key = periodKey(entry.occurredOn, grouping);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: periodLabel(key, grouping),
        startMinor: balance,
        incomeMinor: 0,
        expenseMinor: 0,
        endMinor: balance,
        entries: [],
      };
      groups.push(group);
    }
    if (entry.kind === "income") {
      group.incomeMinor += entry.amountMinor;
      balance += entry.amountMinor;
    } else {
      group.expenseMinor += entry.amountMinor;
      balance -= entry.amountMinor;
    }
    group.endMinor = balance;
    group.entries.unshift(entry);
  }

  return groups.reverse();
}

/**
 * Промежуток, который запросить для группировки. `pages` растёт по кнопке
 * «Показать раньше». Границы выровнены по периодам, иначе первая неделя или
 * месяц на экране были бы обрезаны и показывали неполный итог.
 */
export function cashRangeFor(
  grouping: TravelCashGrouping,
  today: string,
  pages: number,
): { from: string; to: string } {
  const to = parseDay(today);
  let from: Date;
  switch (grouping) {
    case "day":
      from = addDays(to, -(31 * pages - 1));
      break;
    case "week":
      from = addDays(weekStart(to), -7 * (12 * pages - 1));
      break;
    case "month":
      from = new Date(
        Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (12 * pages - 1), 1),
      );
      break;
    case "year":
      from = new Date(Date.UTC(to.getUTCFullYear() - (3 * pages - 1), 0, 1));
      break;
  }
  const earliest = addDays(to, -MAX_CASH_RANGE_DAYS);
  if (from < earliest) {
    // Дальше предела API не пускает. Для месяцев и лет выравниваем начало
    // вперёд к целому периоду, чтобы верхняя группа не была обрезанной.
    from =
      grouping === "year"
        ? new Date(Date.UTC(earliest.getUTCFullYear() + 1, 0, 1))
        : grouping === "month"
          ? new Date(
              Date.UTC(
                earliest.getUTCFullYear(),
                earliest.getUTCMonth() + 1,
                1,
              ),
            )
          : grouping === "week"
            ? addDays(weekStart(earliest), 7)
            : earliest;
  }
  return { from: formatDay(from), to: formatDay(to) };
}

/** Сегодня по часам браузера — день, который человек видит на календаре. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
