import type {
  WorkCommercialSettingsInput,
  WorkCurrency,
  WorkOvertimeMode,
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
