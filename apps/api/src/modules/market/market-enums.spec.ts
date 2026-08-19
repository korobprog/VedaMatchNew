import { BadRequestException } from '@nestjs/common';
import {
  MarketDeliveryOption,
  MarketOrderStatus,
  MarketReportStatus,
} from '@prisma/client';
import {
  MARKET_DELIVERY_OPTIONS,
  MARKET_ORDER_STATUSES,
  MARKET_REPORT_STATUSES,
  OWNER_SHOP_STATUSES,
  assertOneOf,
  parseOptionalEnum,
} from './market-enums';

/** Списки в market-enums.ts — рукописные копии enum'ов схемы: если член
 *  добавят только в schema.prisma, валидация начнёт отбрасывать легальные
 *  значения. Сверяем состав (порядок неважен). */
describe('market-enums — синхронизация со schema.prisma', () => {
  it('order statuses', () => {
    expect([...MARKET_ORDER_STATUSES].sort()).toEqual(
      Object.values(MarketOrderStatus).sort(),
    );
  });

  it('report statuses', () => {
    expect([...MARKET_REPORT_STATUSES].sort()).toEqual(
      Object.values(MarketReportStatus).sort(),
    );
  });

  it('delivery options', () => {
    expect([...MARKET_DELIVERY_OPTIONS].sort()).toEqual(
      Object.values(MarketDeliveryOption).sort(),
    );
  });

  it('owner may only toggle active/closed', () => {
    expect(OWNER_SHOP_STATUSES).toEqual(['active', 'closed']);
  });
});

describe('assertOneOf / parseOptionalEnum', () => {
  it('пропускает значение из списка', () => {
    expect(assertOneOf(MARKET_ORDER_STATUSES, 'accepted', 'x')).toBe(
      'accepted',
    );
  });

  it('мусор — 400 с указанным кодом, а не 500 из Prisma', () => {
    expect(() =>
      assertOneOf(MARKET_ORDER_STATUSES, 'hacked', 'invalid_status'),
    ).toThrow(BadRequestException);
    expect(() =>
      assertOneOf(MARKET_ORDER_STATUSES, 42, 'invalid_status'),
    ).toThrow(BadRequestException);
    expect(() =>
      assertOneOf(MARKET_ORDER_STATUSES, undefined, 'invalid_status'),
    ).toThrow(BadRequestException);
  });

  it('parseOptionalEnum: пусто → undefined, мусор → 400', () => {
    expect(
      parseOptionalEnum(MARKET_REPORT_STATUSES, undefined, 'x'),
    ).toBeUndefined();
    expect(parseOptionalEnum(MARKET_REPORT_STATUSES, '', 'x')).toBeUndefined();
    expect(parseOptionalEnum(MARKET_REPORT_STATUSES, 'open', 'x')).toBe('open');
    expect(() =>
      parseOptionalEnum(MARKET_REPORT_STATUSES, 'closed', 'x'),
    ).toThrow(BadRequestException);
  });
});
