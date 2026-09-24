import { BadRequestException } from '@nestjs/common';
import {
  WORK_CLIENT_NAME_MAX,
  WORK_CURRENCIES,
  WORK_LINE_ITEM_TITLE_MAX,
  WORK_MONEY_MAX_MINOR,
  WORK_OVERTIME_MAX_DAYS,
  WORK_OVERTIME_MAX_MINUTES,
  WORK_OVERTIME_MIN_MINUTES,
  WORK_OVERTIME_REASON_MAX,
  WORK_TIME_ENTRY_MAX_MINUTES,
  type WorkCommercialSettingsInput,
  type WorkCurrency,
  type WorkLineItemKind,
  type WorkMemberRole,
  type WorkOvertimeMode,
  type WorkPayoutPeriodKind,
  type WorkPricingModel,
} from '@vedamatch/shared';

/**
 * Проверка входа коммерческой доски (VED-458). Мусор — отказ, а не молчаливое
 * «0»: ставка, тихо ставшая нулём, — это неоплаченная работа.
 */

/** Поля доски, которые меняют настройки оплаты. */
export interface WorkCommercialSettingsData {
  clientName?: string;
  currency?: WorkCurrency;
  pricingModel?: WorkPricingModel;
  rateMinor?: number;
  dailyNormMinutes?: number;
  overtimeRateMinor?: number;
  overtimeMode?: WorkOvertimeMode;
  budgetMinor?: number;
  timezone?: string;
  payoutPeriod?: WorkPayoutPeriodKind;
  payoutDay?: number;
}

/** Сумма в копейках: целое от 0 до потолка. */
export function parseWorkMoney(value: unknown, field: string): number {
  const amount = typeof value === 'number' ? value : Number.NaN;
  if (
    !Number.isInteger(amount) ||
    amount < 0 ||
    amount > WORK_MONEY_MAX_MINOR
  ) {
    throw new BadRequestException(`${field}: нужна сумма не меньше нуля`);
  }
  return amount;
}

/** Минуты: целое от 0 до предела. */
export function parseWorkMinutes(
  value: unknown,
  field: string,
  max: number,
): number {
  const minutes = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > max) {
    throw new BadRequestException(`${field}: целое число минут от 0 до ${max}`);
  }
  return minutes;
}

export function isWorkTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (
    typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as T;
  }
  throw new BadRequestException(`${field}: одно из ${allowed.join(', ')}`);
}

/**
 * Настройки оплаты из запроса. Отсутствующие поля не трогаются — это и
 * создание (там умолчания базы), и частичная правка.
 */
export function parseWorkCommercialSettings(
  input: WorkCommercialSettingsInput | null | undefined,
): WorkCommercialSettingsData {
  if (input === null || input === undefined) return {};
  if (typeof input !== 'object') {
    throw new BadRequestException('Настройки оплаты: нужен объект');
  }
  const data: WorkCommercialSettingsData = {};
  if (input.clientName !== undefined) {
    const name =
      typeof input.clientName === 'string' ? input.clientName.trim() : '';
    if (name.length > WORK_CLIENT_NAME_MAX) {
      throw new BadRequestException(
        `Клиент: не длиннее ${WORK_CLIENT_NAME_MAX} знаков`,
      );
    }
    data.clientName = name;
  }
  if (input.currency !== undefined) {
    data.currency = pick(input.currency, WORK_CURRENCIES, 'Валюта');
  }
  if (input.pricingModel !== undefined) {
    data.pricingModel = pick(
      input.pricingModel,
      ['hourly', 'fixed'] as const,
      'Модель цены',
    );
  }
  if (input.overtimeMode !== undefined) {
    data.overtimeMode = pick(
      input.overtimeMode,
      ['on_request', 'auto'] as const,
      'Сверх нормы',
    );
  }
  if (input.rateMinor !== undefined) {
    data.rateMinor = parseWorkMoney(input.rateMinor, 'Ставка');
  }
  if (input.overtimeRateMinor !== undefined) {
    data.overtimeRateMinor = parseWorkMoney(
      input.overtimeRateMinor,
      'Ставка сверх нормы',
    );
  }
  if (input.budgetMinor !== undefined) {
    data.budgetMinor = parseWorkMoney(input.budgetMinor, 'Бюджет');
  }
  if (input.dailyNormMinutes !== undefined) {
    data.dailyNormMinutes = parseWorkMinutes(
      input.dailyNormMinutes,
      'Норма в день',
      24 * 60,
    );
  }
  if (input.payoutPeriod !== undefined) {
    data.payoutPeriod = pick(
      input.payoutPeriod,
      ['weekly', 'biweekly', 'monthly'] as const,
      'Период выплат',
    );
  }
  if (input.payoutDay !== undefined) {
    const day = typeof input.payoutDay === 'number' ? input.payoutDay : NaN;
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      throw new BadRequestException('День подбития: от 1 до 28');
    }
    data.payoutDay = day;
  }
  if (input.timezone !== undefined) {
    const zone =
      typeof input.timezone === 'string' ? input.timezone.trim() : '';
    if (!zone || !isWorkTimezone(zone)) {
      throw new BadRequestException('Часовой пояс: неизвестный');
    }
    data.timezone = zone;
  }
  return data;
}

/**
 * Кто видит деньги доски целиком — ставки, бюджет, чужие суммы — и меняет
 * их: ведущий доски и администрация среды. Администрация — страховка: ведущий
 * может пропасть, а выплаты не должны зависнуть.
 */
export function canManageWorkFinance(
  role: WorkMemberRole | null,
  isLead: boolean,
): boolean {
  if (!role) return false;
  return isLead || role === 'admin' || role === 'owner';
}

/** Время задним числом: начало и длина. Будущее — ошибка ввода. */
export function parseWorkTimeEntry(
  startedAt: unknown,
  minutes: unknown,
  now: Date,
): { startedAt: Date; endedAt: Date } {
  const start =
    typeof startedAt === 'string' ? new Date(startedAt) : new Date(Number.NaN);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException('Начало: нужна дата и время');
  }
  const length = parseWorkMinutes(
    minutes,
    'Длительность',
    WORK_TIME_ENTRY_MAX_MINUTES,
  );
  if (length === 0) {
    throw new BadRequestException('Длительность: хотя бы минута');
  }
  const end = new Date(start.getTime() + length * 60_000);
  if (end.getTime() > now.getTime() + 60_000) {
    throw new BadRequestException('Время: нельзя записать будущее');
  }
  return { startedAt: start, endedAt: end };
}

export function parseWorkLineItem(input: {
  kind?: unknown;
  title?: unknown;
  amountMinor?: unknown;
}): { kind: WorkLineItemKind; title: string; amountMinor: number } {
  const kind = pick(input.kind, ['expense', 'discount'] as const, 'Вид строки');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new BadRequestException('Название строки: нужно заполнить');
  if (title.length > WORK_LINE_ITEM_TITLE_MAX) {
    throw new BadRequestException(
      `Название строки: не длиннее ${WORK_LINE_ITEM_TITLE_MAX} знаков`,
    );
  }
  const amountMinor = parseWorkMoney(input.amountMinor, 'Сумма');
  if (amountMinor === 0) throw new BadRequestException('Сумма: больше нуля');
  return { kind, title, amountMinor };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** День пояса доски строкой; `2026-02-30` — отказ, а не 2 марта. */
function parseDay(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const date = DAY_RE.test(text) ? new Date(`${text}T00:00:00Z`) : null;
  if (
    !date ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
  ) {
    throw new BadRequestException(`${field}: нужна дата`);
  }
  return text;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Запрос сверх нормы (VED-459). Задним числом — не дальше периода запроса:
 * просить одобрения вчерашнего вечера нормально, прошлогоднего — нет.
 */
export function parseWorkOvertimeRequest(
  input: {
    fromDay?: unknown;
    toDay?: unknown;
    minutesPerDay?: unknown;
    reason?: unknown;
  },
  today: string,
): { fromDay: string; toDay: string; minutesPerDay: number; reason: string } {
  const fromDay = parseDay(input.fromDay, 'С какого дня');
  const toDay = parseDay(input.toDay, 'По какой день');
  if (toDay < fromDay) {
    throw new BadRequestException('Период: конец раньше начала');
  }
  const span =
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) /
      86_400_000 +
    1;
  if (span > WORK_OVERTIME_MAX_DAYS) {
    throw new BadRequestException(
      `Период: не длиннее ${WORK_OVERTIME_MAX_DAYS} дней`,
    );
  }
  if (fromDay < shiftDay(today, -WORK_OVERTIME_MAX_DAYS)) {
    throw new BadRequestException(
      `Период: задним числом не дальше ${WORK_OVERTIME_MAX_DAYS} дней`,
    );
  }
  const minutesPerDay =
    typeof input.minutesPerDay === 'number' ? input.minutesPerDay : Number.NaN;
  if (
    !Number.isInteger(minutesPerDay) ||
    minutesPerDay < WORK_OVERTIME_MIN_MINUTES ||
    minutesPerDay > WORK_OVERTIME_MAX_MINUTES
  ) {
    throw new BadRequestException(
      'Сверх нормы в день: от 15 минут до 12 часов',
    );
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length > WORK_OVERTIME_REASON_MAX) {
    throw new BadRequestException(
      `Причина: не длиннее ${WORK_OVERTIME_REASON_MAX} знаков`,
    );
  }
  return { fromDay, toDay, minutesPerDay, reason };
}

/**
 * День подбития под период: у недели — день недели 1…7, у месяца — число
 * 1…28. Проверяется по итоговым значениям, потому что правка может прислать
 * только одно из двух полей.
 */
export function assertWorkPayoutDay(
  period: WorkPayoutPeriodKind,
  payoutDay: number,
): void {
  if (period !== 'monthly' && payoutDay > 7) {
    throw new BadRequestException(
      'День подбития: для недели — день недели от 1 (пн) до 7 (вс)',
    );
  }
}
