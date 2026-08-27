/**
 * Дата рождения по частям: день, месяц, год.
 *
 * Нативный `input[type=date]` для даты рождения неудобен ровно там, где он
 * нужен: пикер открывается на текущем годе, и до 1985-го приходится крутить
 * список десятилетиями. Три `select` решают это одним движением, остаются
 * родными для клавиатуры и скринридера — и не требуют ARIA-подпорок.
 *
 * Логика вынесена сюда, чтобы её проверял тест: в форме она перемешана с
 * запросами и состоянием, а ошибка в високосном годе тихо испортит карту.
 */

export interface BirthDateParts {
  day: string;
  month: string;
  year: string;
}

export const EMPTY_PARTS: BirthDateParts = { day: "", month: "", year: "" };

/** Сколько лет назад имеет смысл предлагать. Сверх этого — опечатка. */
export const MAX_AGE_YEARS = 120;

export const MONTH_NAMES = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** ISO `YYYY-MM-DD` → части. Пустая или битая строка даёт пустые части. */
export function toParts(iso: string | null | undefined): BirthDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return EMPTY_PARTS;
  return { year: match[1], month: match[2], day: match[3] };
}

/** Сколько дней в месяце; февраль считается по високосности года. */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isFinite(year) || month < 1 || month > 12) return 31;
  // Нулевой день следующего месяца — последний день текущего.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Части → ISO. `null`, если чего-то не хватает или такой даты не бывает:
 * 31 февраля выбрать можно, а существовать оно не начнёт.
 */
export function toIso(parts: BirthDateParts): string | null {
  const { day, month, year } = parts;
  if (!day || !month || !year) return null;

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(
    d,
  ).padStart(2, "0")}`;
}

/**
 * Меняет часть даты и подрезает день под новый месяц: выбрал 31-е, потом
 * февраль — день молча исчезнет из списка, и поле останется пустым, будто его
 * и не заполняли. Лучше показать 29-е, чем ничего.
 */
export function withPart(
  parts: BirthDateParts,
  key: keyof BirthDateParts,
  value: string,
): BirthDateParts {
  const next = { ...parts, [key]: value };
  if (key === "day" || !next.day) return next;

  const limit = daysInMonth(Number(next.year) || LEAP_FALLBACK_YEAR, Number(next.month) || 1);
  if (Number(next.day) > limit) {
    next.day = String(limit).padStart(2, "0");
  }
  return next;
}

/**
 * Год для длины февраля, пока настоящий не выбран: високосный, потому что
 * 29-е существует чаще, чем нет, и прятать его заранее — терять день.
 */
export const LEAP_FALLBACK_YEAR = 2024;

/** Годы для списка: от нынешнего вниз, сначала недавние. */
export function yearOptions(today: Date): number[] {
  const current = today.getUTCFullYear();
  return Array.from({ length: MAX_AGE_YEARS + 1 }, (_, i) => current - i);
}

/**
 * Что не так с датой; `null` — всё в порядке. Дата рождения в будущем — не
 * придирка: старая форма принимала её молча, и карта строилась по моменту,
 * которого ещё не было.
 */
export function birthDateProblem(
  parts: BirthDateParts,
  today: Date,
): string | null {
  const { day, month, year } = parts;
  if (!day || !month || !year) return "Укажите день, месяц и год рождения.";

  const iso = toIso(parts);
  if (!iso) return "Такой даты не существует — проверьте день и месяц.";

  const todayIso = today.toISOString().slice(0, 10);
  if (iso > todayIso) return "Дата рождения не может быть в будущем.";

  return null;
}
