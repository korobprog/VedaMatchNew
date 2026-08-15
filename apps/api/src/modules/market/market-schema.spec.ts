import {
  MarketCurrency,
  MarketDeliveryOption,
  MarketListingCondition,
  MarketListingKind,
  MarketListingStatus,
  MarketPriceMode,
  MarketServiceFormat,
  MarketShopStatus,
} from '@prisma/client';
import type {
  MarketCurrency as MarketCurrencyDto,
  MarketDeliveryOption as MarketDeliveryOptionDto,
  MarketListingCondition as MarketListingConditionDto,
  MarketListingKind as MarketListingKindDto,
  MarketListingStatus as MarketListingStatusDto,
  MarketPriceMode as MarketPriceModeDto,
  MarketServiceFormat as MarketServiceFormatDto,
  MarketShopStatus as MarketShopStatusDto,
} from '@vedamatch/shared';

/**
 * Энумы Prisma и строковые юнионы в @vedamatch/shared описывают одно и то же
 * множество и разъезжаются молча: TypeScript не сверяет схему БД с DTO.
 * Присваивания ниже — компиляционная сверка, ожидания — проверка порядка и
 * состава на случай, если член энума добавят только в одном месте.
 */
describe('Market Prisma schema', () => {
  it('keeps listing kind and status in sync with the shared types', () => {
    const kinds: MarketListingKindDto[] = Object.values(MarketListingKind);
    expect(kinds).toEqual(['product', 'service']);

    const statuses: MarketListingStatusDto[] = Object.values(MarketListingStatus);
    expect(statuses).toEqual([
      'draft',
      'published',
      'hidden_by_author',
      'sold_out',
      'hidden_by_reports',
      'removed_by_admin',
    ]);
  });

  // `new` — зарезервированное слово в слишком многих местах, поэтому `new_item`.
  // Переименование потом обошлось бы миграцией данных.
  it('names the pristine condition new_item, not new', () => {
    const conditions: MarketListingConditionDto[] = Object.values(
      MarketListingCondition,
    );
    expect(conditions).toEqual(['new_item', 'like_new', 'used', 'refurbished']);
    expect(conditions).not.toContain('new');
  });

  it('exposes every price mode the catalog filters on', () => {
    const modes: MarketPriceModeDto[] = Object.values(MarketPriceMode);
    expect(modes).toEqual(['fixed', 'from', 'negotiable', 'free']);
  });

  it('exposes the four supported currencies', () => {
    const currencies: MarketCurrencyDto[] = Object.values(MarketCurrency);
    expect(currencies).toEqual(['rub', 'usd', 'eur', 'inr']);
  });

  it('exposes delivery options and service formats', () => {
    const delivery: MarketDeliveryOptionDto[] = Object.values(MarketDeliveryOption);
    expect(delivery).toEqual([
      'pickup',
      'courier',
      'post',
      'cdek',
      'digital',
      'shipping_worldwide',
    ]);

    const formats: MarketServiceFormatDto[] = Object.values(MarketServiceFormat);
    expect(formats).toEqual(['online', 'offline', 'any']);
  });

  it('exposes shop statuses including the two moderation ones', () => {
    const statuses: MarketShopStatusDto[] = Object.values(MarketShopStatus);
    expect(statuses).toEqual([
      'active',
      'closed',
      'hidden_by_reports',
      'blocked_by_admin',
    ]);
  });
});
