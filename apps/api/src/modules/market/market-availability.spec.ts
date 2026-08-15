import type { MarketListingStatus, MarketShopStatus } from '@vedamatch/shared';
import {
  checkCartEligibility,
  isAvailable,
  isPubliclyVisible,
  type AvailabilityInput,
} from './market-availability';

const base: AvailabilityInput = {
  status: 'published',
  trackStock: false,
  quantity: null,
  shopStatus: 'active',
};

const listingStatuses: MarketListingStatus[] = [
  'draft',
  'published',
  'hidden_by_author',
  'sold_out',
  'hidden_by_reports',
  'removed_by_admin',
];

const shopStatuses: MarketShopStatus[] = [
  'active',
  'closed',
  'hidden_by_reports',
  'blocked_by_admin',
];

describe('isPubliclyVisible', () => {
  it('shows only published and sold-out listings', () => {
    const visible = listingStatuses.filter((status) =>
      isPubliclyVisible({ status, shopStatus: 'active' }),
    );
    expect(visible).toEqual(['published', 'sold_out']);
  });

  it('hides the whole storefront when the shop is not active', () => {
    for (const shopStatus of shopStatuses.filter((s) => s !== 'active')) {
      for (const status of listingStatuses) {
        expect({ shopStatus, status, visible: isPubliclyVisible({ status, shopStatus }) }).toEqual(
          { shopStatus, status, visible: false },
        );
      }
    }
  });
});

describe('isAvailable', () => {
  it('keeps a sold-out listing visible but not orderable', () => {
    const soldOut = { ...base, status: 'sold_out' as const };
    expect(isPubliclyVisible(soldOut)).toBe(true);
    expect(isAvailable(soldOut)).toBe(false);
  });

  it('treats a null quantity as "in stock" when tracking is off', () => {
    expect(isAvailable({ ...base, trackStock: false, quantity: null })).toBe(true);
  });

  it('treats a zero quantity as out of stock when tracking is on', () => {
    expect(isAvailable({ ...base, trackStock: true, quantity: 0 })).toBe(false);
    expect(isAvailable({ ...base, trackStock: true, quantity: null })).toBe(false);
    expect(isAvailable({ ...base, trackStock: true, quantity: 1 })).toBe(true);
  });

  it('covers the full status × tracking × quantity matrix', () => {
    for (const status of listingStatuses) {
      for (const trackStock of [true, false]) {
        for (const quantity of [null, 0, 3]) {
          const available = isAvailable({ ...base, status, trackStock, quantity });
          const expected =
            status === 'published' &&
            (trackStock ? (quantity ?? 0) > 0 : true);
          expect({ status, trackStock, quantity, available }).toEqual({
            status,
            trackStock,
            quantity,
            available: expected,
          });
        }
      }
    }
  });
});

describe('checkCartEligibility', () => {
  it('accepts a normal request', () => {
    expect(checkCartEligibility({ ...base, requestedQuantity: 1 })).toBeNull();
    expect(
      checkCartEligibility({
        ...base,
        trackStock: true,
        quantity: 5,
        requestedQuantity: 5,
      }),
    ).toBeNull();
  });

  it('rejects unavailable listings before looking at the quantity', () => {
    expect(
      checkCartEligibility({
        ...base,
        status: 'sold_out',
        requestedQuantity: 1,
      }),
    ).toBe('cart_item_unavailable');
    expect(
      checkCartEligibility({
        ...base,
        shopStatus: 'blocked_by_admin',
        requestedQuantity: 1,
      }),
    ).toBe('cart_item_unavailable');
  });

  it('rejects a request above the tracked stock', () => {
    expect(
      checkCartEligibility({
        ...base,
        trackStock: true,
        quantity: 2,
        requestedQuantity: 3,
      }),
    ).toBe('quantity_exceeds_stock');
  });

  it('ignores the stock ceiling when tracking is off', () => {
    expect(
      checkCartEligibility({ ...base, trackStock: false, requestedQuantity: 99 }),
    ).toBeNull();
  });

  it('rejects zero, negative and fractional quantities', () => {
    for (const requestedQuantity of [0, -1, 1.5, Number.NaN]) {
      expect(checkCartEligibility({ ...base, requestedQuantity })).toBe(
        'quantity_exceeds_stock',
      );
    }
  });
});
