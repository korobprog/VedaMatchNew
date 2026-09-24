import type {
  WorkCommercialSettingsInput,
  WorkOvertimeRequestStatus,
  WorkCurrency,
  WorkOvertimeMode,
  WorkPayoutPeriodKind,
  WorkPayoutStatus,
  WorkPricingModel,
} from "@vedamatch/shared";

/**
 * Деньги и часы коммерческой доски (VED-458) для глаза и из поля ввода. Сервер
 * держит копейки и минуты; человек пишет «1 500» и «1,5 ч».
 */

const SYMBOL: Record<WorkCurrency, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  INR: "₹",
};

export function currencySymbol(currency: WorkCurrency): string {
  return SYMBOL[currency];
}

/** 150000 → «1 500 ₽», 150050 → «1 500,50 ₽»: копейки только когда есть. */
export function formatMoney(minor: number, currency: WorkCurrency): string {
  const whole = minor % 100 === 0;
  const text = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return `${text} ${SYMBOL[currency]}`;
}

/**
 * «1 500», «1500,5», «1 500.50» → копейки. Пустое → `null`, мусор и
 * отрицательное → `NaN`: форма покажет ошибку, а не отправит ноль.
 */
export function parseMoneyInput(text: string): number | null {
  const clean = text.replace(/[\s ₽$€₹]/g, "").replace(",", ".");
  if (!clean) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Math.round(Number(clean) * 100);
}

/** Копейки обратно в поле ввода: 150000 → «1500», 150050 → «1500,5». */
export function moneyToInput(minor: number): string {
  if (!minor) return "";
  return String(minor / 100).replace(".", ",");
}

/** 390 → «6 ч 30 мин», 45 → «45 мин», 0 → «0 мин». */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/**
 * Часы из поля: «3», «1,5», «1.25», «1:30». Пустое → `null`, мусор → `NaN`.
 */
export function parseHoursInput(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!clean) return null;
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(clean);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Math.round(Number(clean) * 60);
}

/** Минуты обратно в поле часов: 90 → «1,5», 100 → «1:40». */
export function minutesToHoursInput(minutes: number | null): string {
  if (minutes === null || minutes === 0) return "";
  if (minutes % 15 === 0) return String(minutes / 60).replace(".", ",");
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Черновик формы настроек: всё строками, как в полях. */
export interface CommercialDraft {
  clientName: string;
  currency: WorkCurrency;
  pricingModel: WorkPricingModel;
  rate: string;
  normHours: string;
  overtimeRate: string;
  overtimeMode: WorkOvertimeMode;
  budget: string;
  payoutPeriod: WorkPayoutPeriodKind;
  /** День недели 1…7 или число месяца 1…28 — строкой, как в списке. */
  payoutDay: string;
  /** Через сколько дней неоплаты напомнить; «0» — не напоминать. */
  reminderDays: string;
}

export const EMPTY_COMMERCIAL_DRAFT: CommercialDraft = {
  clientName: "",
  currency: "RUB",
  pricingModel: "hourly",
  rate: "",
  normHours: "",
  overtimeRate: "",
  overtimeMode: "on_request",
  budget: "",
  payoutPeriod: "weekly",
  payoutDay: "5",
  reminderDays: "3",
};

/**
 * Черновик → запрос. Ошибка возвращается словами для формы; пустые суммы и
 * норма — ноль («без бюджета», «без нормы»).
 */
export function commercialDraftToInput(
  draft: CommercialDraft,
  timezone: string,
): { input: WorkCommercialSettingsInput } | { error: string } {
  const rate = parseMoneyInput(draft.rate);
  const overtimeRate = parseMoneyInput(draft.overtimeRate);
  const budget = parseMoneyInput(draft.budget);
  const norm = parseHoursInput(draft.normHours);
  if (Number.isNaN(rate)) return { error: "Ставка: число, например 1500" };
  if (Number.isNaN(overtimeRate)) {
    return { error: "Ставка сверх нормы: число, например 2250" };
  }
  if (Number.isNaN(budget)) return { error: "Бюджет: число, например 120000" };
  if (Number.isNaN(norm) || (norm !== null && norm > 24 * 60)) {
    return { error: "Норма в день: часы от 0 до 24, например 3" };
  }
  return {
    input: {
      clientName: draft.clientName.trim(),
      currency: draft.currency,
      pricingModel: draft.pricingModel,
      rateMinor: rate ?? 0,
      dailyNormMinutes: norm ?? 0,
      overtimeRateMinor: overtimeRate ?? 0,
      overtimeMode: draft.overtimeMode,
      budgetMinor: budget ?? 0,
      timezone,
      payoutPeriod: draft.payoutPeriod,
      payoutDay: payoutDayFor(draft.payoutPeriod, Number(draft.payoutDay)),
      paymentReminderDays: Number(draft.reminderDays) || 0,
    },
  };
}

/** Пояс браузера — «день» для нормы у того, кто заводит доску. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";
  } catch {
    return "Europe/Moscow";
  }
}

/** Идущий таймер: 3725000 мс → «1:02:05». */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

/** Значение для `<input type="datetime-local">` в местном времени браузера. */
export function toDateTimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const MONTHS = [
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

/** «24 сентября» или «28 сентября — 2 октября»: дни доски приходят строкой. */
export function formatDayRange(fromDay: string, toDay: string): string {
  const day = (value: string) => {
    const [, month, date] = value.split("-").map(Number);
    return `${date} ${MONTHS[month - 1] ?? ""}`.trim();
  };
  return fromDay === toDay ? day(fromDay) : `${day(fromDay)} — ${day(toDay)}`;
}

export const OVERTIME_STATUS_LABEL: Record<WorkOvertimeRequestStatus, string> =
  {
    pending: "ждёт решения",
    approved: "одобрено",
    rejected: "не одобрено",
    cancelled: "отозвано",
  };

/** Сдвиг дня строкой: для «по какой день» по умолчанию. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const WEEKDAYS = [
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
  "воскресенье",
];

/**
 * День подбития под период: сменили месяц на неделю — число 20 не день
 * недели, берём пятницу, а не отправляем сервер угадывать.
 */
export function payoutDayFor(
  period: WorkPayoutPeriodKind,
  day: number,
): number {
  if (!Number.isInteger(day) || day < 1) return period === "monthly" ? 1 : 5;
  if (period === "monthly") return Math.min(day, 28);
  return day > 7 ? 5 : day;
}

/** «раз в неделю, в пятницу», «раз в месяц, 10-го». */
export function describePayoutSchedule(
  period: WorkPayoutPeriodKind,
  day: number,
): string {
  if (period === "monthly") return `раз в месяц, ${day}-го`;
  const weekday = WEEKDAYS[day - 1] ?? "";
  const on = day === 2 ? "во" : "в";
  const accusative = weekday.replace(/а$/, "у");
  return `${period === "weekly" ? "раз в неделю" : "раз в две недели"}, ${on} ${accusative}`;
}

export const PAYOUT_STATUS_LABEL: Record<WorkPayoutStatus, string> = {
  open: "идёт",
  closed: "подбит",
  sent: "отправлен",
  paid: "оплачен",
};

/** «19–25 сентября» или «28 сентября — 2 октября». */
export function formatPayoutRange(fromDay: string, toDay: string): string {
  const [, fromMonth, fromDate] = fromDay.split("-").map(Number);
  const [, toMonth, toDate] = toDay.split("-").map(Number);
  if (fromDay === toDay) return `${toDate} ${MONTHS[toMonth - 1]}`;
  return fromMonth === toMonth
    ? `${fromDate}–${toDate} ${MONTHS[toMonth - 1]}`
    : `${fromDate} ${MONTHS[fromMonth - 1]} — ${toDate} ${MONTHS[toMonth - 1]}`;
}

