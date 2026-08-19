import { BadRequestException } from '@nestjs/common';
import type {
  MarketDeliveryOption,
  MarketOrderStatus,
  MarketReportStatus,
  MarketShopStatus,
} from '@vedamatch/shared';

/**
 * Рантайм-списки значений enum'ов Рынка. В `@vedamatch/shared` они только
 * типы, а из Prisma тянуть их в валидацию не хочется — списки должны быть
 * доступны и в чистых юнитах без клиента. Расхождение со schema.prisma ловит
 * market-enums.spec.ts.
 *
 * Зачем вообще проверять: глобального ValidationPipe нет, DTO — TS-интерфейсы,
 * и мусор из query/body доезжал бы до Prisma и падал 500 вместо честного 400.
 */
export const MARKET_ORDER_STATUSES: readonly MarketOrderStatus[] = [
  'new_request',
  'accepted',
  'in_progress',
  'completed',
  'declined_by_seller',
  'cancelled_by_buyer',
];

export const MARKET_REPORT_STATUSES: readonly MarketReportStatus[] = [
  'open',
  'reviewed',
  'dismissed',
];

export const MARKET_DELIVERY_OPTIONS: readonly MarketDeliveryOption[] = [
  'pickup',
  'courier',
  'post',
  'cdek',
  'digital',
  'shipping_worldwide',
];

/** Статусы, которые владелец вправе выставить сам. `hidden_by_reports` и
 *  `blocked_by_admin` — только модерация. */
export const OWNER_SHOP_STATUSES: readonly Extract<
  MarketShopStatus,
  'active' | 'closed'
>[] = ['active', 'closed'];

export function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === 'string' && (values as readonly string[]).includes(value)
  );
}

/** Обязательное значение: не из списка → 400 с указанным кодом. */
export function assertOneOf<T extends string>(
  values: readonly T[],
  value: unknown,
  code: string,
): T {
  if (!isOneOf(values, value)) throw new BadRequestException(code);
  return value;
}

/** Необязательный фильтр из query: пусто → undefined, мусор → 400. */
export function parseOptionalEnum<T extends string>(
  values: readonly T[],
  value: unknown,
  code: string,
): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return assertOneOf(values, value, code);
}
