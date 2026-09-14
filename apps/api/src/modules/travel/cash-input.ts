import {
  TRAVEL_CASH_ICONS,
  TRAVEL_CASH_KINDS,
  type TravelCashIcon,
  type TravelCashKind,
} from '@vedamatch/shared';
import { countNights, parseStayDate, TravelDateError } from './travel-dates';

/**
 * Разбор ввода кассы. Чистые функции без Nest: сервис превращает
 * `CashInputError` в 400, а правила проверяются тестом без базы.
 */
export class CashInputError extends Error {}

/**
 * Потолок одной записи — десять миллионов в основной валюте. Больше хостел
 * одной строкой не получает и не тратит; такая сумма почти всегда лишние
 * нули. И до предела `INTEGER` в Postgres так остаётся запас.
 */
export const MAX_CASH_AMOUNT_MINOR = 10_000_000 * 100;

export const MAX_CASH_NOTE = 300;
export const MAX_CASH_TAGS = 10;
export const MAX_CASH_TAG = 30;
export const MAX_CASH_CATEGORY_NAME = 40;

/**
 * Самый длинный промежуток одного запроса ленты. Годовая группировка
 * запрашивает три года — это ~1100 дней; дольше в одном экране не читают.
 */
export const MAX_CASH_RANGE_DAYS = 1100;

export interface CashEntryInput {
  kind: TravelCashKind;
  amountMinor: number;
  occurredOn: Date;
  categoryId: string | null;
  note: string;
  tags: string[];
}

export interface CashCategoryInput {
  kind: TravelCashKind;
  name: string;
  icon: TravelCashIcon;
}

function parseKind(value: unknown): TravelCashKind {
  if (
    typeof value !== 'string' ||
    !(TRAVEL_CASH_KINDS as readonly string[]).includes(value)
  ) {
    throw new CashInputError('Укажите, доход это или расход');
  }
  return value as TravelCashKind;
}

function parseDay(value: unknown, field: string): Date {
  try {
    return parseStayDate(value, field);
  } catch (error) {
    if (error instanceof TravelDateError) {
      throw new CashInputError(error.message);
    }
    throw error;
  }
}

/**
 * Теги: без решётки, без повторов и в нижнем регистре. «Ремонт» и «ремонт»
 * одним фильтром должны находить одно и то же.
 */
export function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new CashInputError('Теги передаются списком');
  }
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().replace(/^#+/, '').toLowerCase();
    if (!tag) continue;
    if (tag.length > MAX_CASH_TAG) {
      throw new CashInputError(
        `Тег длиннее ${MAX_CASH_TAG} знаков: «${tag.slice(0, MAX_CASH_TAG)}…»`,
      );
    }
    seen.add(tag);
  }
  if (seen.size > MAX_CASH_TAGS) {
    throw new CashInputError(`Не больше ${MAX_CASH_TAGS} тегов на запись`);
  }
  return [...seen];
}

export function parseCashEntryInput(
  body: Record<string, unknown>,
): CashEntryInput {
  const kind = parseKind(body.kind);

  const amountMinor = body.amountMinor;
  if (
    typeof amountMinor !== 'number' ||
    !Number.isInteger(amountMinor) ||
    amountMinor <= 0
  ) {
    throw new CashInputError('Сумма должна быть больше нуля');
  }
  if (amountMinor > MAX_CASH_AMOUNT_MINOR) {
    throw new CashInputError('Слишком большая сумма — проверьте нули');
  }

  const occurredOn = parseDay(body.occurredOn, 'дата');

  const categoryId =
    typeof body.categoryId === 'string' && body.categoryId.trim()
      ? body.categoryId.trim()
      : null;

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > MAX_CASH_NOTE) {
    throw new CashInputError(`Заметка длиннее ${MAX_CASH_NOTE} знаков`);
  }

  return {
    kind,
    amountMinor,
    occurredOn,
    categoryId,
    note,
    tags: normalizeTags(body.tags),
  };
}

export function parseCashCategoryInput(
  body: Record<string, unknown>,
): CashCategoryInput {
  const kind = parseKind(body.kind);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new CashInputError('У статьи должно быть название');
  if (name.length > MAX_CASH_CATEGORY_NAME) {
    throw new CashInputError(
      `Название статьи длиннее ${MAX_CASH_CATEGORY_NAME} знаков`,
    );
  }
  const icon = body.icon;
  if (
    typeof icon !== 'string' ||
    !(TRAVEL_CASH_ICONS as readonly string[]).includes(icon)
  ) {
    throw new CashInputError('Выберите значок из списка');
  }
  return { kind, name, icon: icon as TravelCashIcon };
}

/** Начальный остаток кассы: может быть и отрицательным — долг тоже остаток. */
export function parseOpeningMinor(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    Math.abs(value) > MAX_CASH_AMOUNT_MINOR
  ) {
    throw new CashInputError('Начальный остаток должен быть целой суммой');
  }
  return value;
}

/**
 * Промежуток ленты, обе границы включительно. Без границ — последние 31 день
 * по `today`: это первый экран ленты по дням.
 */
export function parseCashRange(
  rawFrom: unknown,
  rawTo: unknown,
  today: Date,
): { from: Date; to: Date } {
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const to =
    rawTo === undefined || rawTo === '' ? todayUtc : parseDay(rawTo, 'по');
  const from =
    rawFrom === undefined || rawFrom === ''
      ? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
      : parseDay(rawFrom, 'с');

  const span = countNights(from, to);
  if (span < 0) {
    throw new CashInputError('Начало промежутка позже конца');
  }
  if (span > MAX_CASH_RANGE_DAYS) {
    throw new CashInputError('Слишком длинный промежуток для одного запроса');
  }
  return { from, to };
}
