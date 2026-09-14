import type { Prisma } from '@prisma/client';
import { TRAVEL_CASH_KINDS, type TravelCashKind } from '@vedamatch/shared';
import { CashInputError, MAX_CASH_AMOUNT_MINOR } from './cash-input';

/**
 * Фильтры ленты кассы. Разбор и сборка условия — чистыми функциями: фильтр
 * по сумме и имени гостя легко перепутать местами границ, и тест дешевле,
 * чем разбор жалобы «не находит оплату Кирилла».
 */
export interface CashFilters {
  /** Подстрока в заметке или имени гостя. */
  q: string | null;
  kind: TravelCashKind | null;
  /** Id статьи; строка `none` — записи без статьи. */
  categoryId: string | null;
  guestId: string | null;
  tag: string | null;
  minMinor: number | null;
  maxMinor: number | null;
}

const MAX_QUERY = 100;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function amount(value: unknown, field: string): number | null {
  const text = str(value);
  if (text === null) return null;
  const minor = Number(text);
  if (!Number.isInteger(minor) || minor < 0 || minor > MAX_CASH_AMOUNT_MINOR) {
    throw new CashInputError(`Сумма «${field}» в фильтре — целое число копеек`);
  }
  return minor;
}

export function parseCashFilters(query: Record<string, unknown>): CashFilters {
  const q = str(query.q);
  if (q && q.length > MAX_QUERY) {
    throw new CashInputError('Слишком длинная строка поиска');
  }
  const kind = str(query.kind);
  if (kind && !(TRAVEL_CASH_KINDS as readonly string[]).includes(kind)) {
    throw new CashInputError('Неизвестный вид записи в фильтре');
  }
  const minMinor = amount(query.minMinor, 'от');
  const maxMinor = amount(query.maxMinor, 'до');
  if (minMinor !== null && maxMinor !== null && minMinor > maxMinor) {
    throw new CashInputError('В фильтре «от» больше, чем «до»');
  }
  return {
    q,
    kind: kind as TravelCashKind | null,
    categoryId: str(query.categoryId),
    guestId: str(query.guestId),
    tag: str(query.tag)?.replace(/^#+/, '').toLowerCase() || null,
    minMinor,
    maxMinor,
  };
}

export function hasCashFilters(filters: CashFilters): boolean {
  return Object.values(filters).some((value) => value !== null);
}

/** Условие Prisma поверх уже ограниченных объекта и промежутка. */
export function cashFiltersWhere(
  filters: CashFilters,
): Prisma.TravelCashEntryWhereInput {
  const where: Prisma.TravelCashEntryWhereInput = {};
  if (filters.kind) where.kind = filters.kind;
  if (filters.categoryId) {
    where.categoryId =
      filters.categoryId === 'none' ? null : filters.categoryId;
  }
  if (filters.guestId) where.guestId = filters.guestId;
  if (filters.tag) where.tags = { has: filters.tag };
  if (filters.minMinor !== null || filters.maxMinor !== null) {
    where.amountMinor = {
      ...(filters.minMinor !== null ? { gte: filters.minMinor } : {}),
      ...(filters.maxMinor !== null ? { lte: filters.maxMinor } : {}),
    };
  }
  if (filters.q) {
    where.OR = [
      { note: { contains: filters.q, mode: 'insensitive' } },
      { guest: { fullName: { contains: filters.q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

/** Записей в одном групповом удалении — с запасом на день хостела. */
export const MAX_BULK_ENTRIES = 200;

/** Список id для группового действия: без повторов и пустых. */
export function parseEntryIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new CashInputError('Передайте список записей');
  }
  const ids = [
    ...new Set(
      value.filter(
        (id): id is string => typeof id === 'string' && id.trim() !== '',
      ),
    ),
  ];
  if (ids.length === 0) throw new CashInputError('Не выбрано ни одной записи');
  if (ids.length > MAX_BULK_ENTRIES) {
    throw new CashInputError(`Не больше ${MAX_BULK_ENTRIES} записей за раз`);
  }
  return ids;
}
