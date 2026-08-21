import { BadRequestException } from '@nestjs/common';
import { MarketReportsService } from './market-reports.service';

/**
 * Разбор жалобы без скрытия снимает только модераторское скрытие. Отзыв,
 * удалённый автором (рейтинг по нему уже списан), и магазин, закрытый
 * владельцем, воскресать не должны.
 */
function makeService(opts: {
  targetKind: 'shop' | 'comment' | 'review' | 'listing';
  targetStatus: string;
}) {
  const idField = `${opts.targetKind}Id`;
  const report = {
    id: 'rep1',
    targetKind: opts.targetKind,
    targetKey: `${opts.targetKind}:t1`,
    listingId: null,
    shopId: null,
    commentId: null,
    reviewId: null,
    status: 'open',
    [idField]: 't1',
  };
  const target = {
    findUnique: jest.fn().mockResolvedValue({ status: opts.targetStatus }),
    update: jest.fn().mockResolvedValue({}),
  };
  const tx = {
    marketReport: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    marketShop: target,
    marketListingComment: target,
    marketReview: target,
    marketListing: target,
  };
  const prisma = {
    marketReport: {
      findUnique: jest.fn().mockResolvedValue(report),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const events = { emit: jest.fn() };
  const service = new MarketReportsService(prisma as never, events as never);
  return { service, target, prisma };
}

const statusOf = (target: { update: jest.Mock }) =>
  (target.update.mock.calls[0][0] as { data: { status?: string } }).data.status;

describe('MarketReportsService.resolve — восстановление цели', () => {
  it('отзыв removed_by_author не воскресает', async () => {
    const { service, target } = makeService({
      targetKind: 'review',
      targetStatus: 'removed_by_author',
    });
    await service.resolve(true, 'admin', 'rep1', { status: 'dismissed' });
    expect(statusOf(target)).toBeUndefined();
  });

  it('отзыв removed_by_admin возвращается в published', async () => {
    const { service, target } = makeService({
      targetKind: 'review',
      targetStatus: 'removed_by_admin',
    });
    await service.resolve(true, 'admin', 'rep1', { status: 'dismissed' });
    expect(statusOf(target)).toBe('published');
  });

  it('комментарий removed_by_author не воскресает', async () => {
    const { service, target } = makeService({
      targetKind: 'comment',
      targetStatus: 'removed_by_author',
    });
    await service.resolve(true, 'admin', 'rep1', { status: 'dismissed' });
    expect(statusOf(target)).toBeUndefined();
  });

  it('магазин closed владельцем остаётся closed', async () => {
    const { service, target } = makeService({
      targetKind: 'shop',
      targetStatus: 'closed',
    });
    await service.resolve(true, 'admin', 'rep1', { status: 'dismissed' });
    expect(statusOf(target)).toBeUndefined();
  });

  it('магазин hidden_by_reports открывается', async () => {
    const { service, target } = makeService({
      targetKind: 'shop',
      targetStatus: 'hidden_by_reports',
    });
    await service.resolve(true, 'admin', 'rep1', { status: 'reviewed' });
    expect(statusOf(target)).toBe('active');
  });

  it('hideTarget скрывает независимо от текущего статуса', async () => {
    const { service, target } = makeService({
      targetKind: 'shop',
      targetStatus: 'active',
    });
    await service.resolve(true, 'admin', 'rep1', {
      status: 'reviewed',
      hideTarget: true,
    });
    expect(statusOf(target)).toBe('blocked_by_admin');
  });

  it('status вне reviewed|dismissed → 400', async () => {
    const { service, prisma } = makeService({
      targetKind: 'shop',
      targetStatus: 'active',
    });
    await expect(
      service.resolve(true, 'admin', 'rep1', { status: 'open' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('MarketReportsService.listForAdmin — фильтр статуса', () => {
  it('мусор в query → 400', async () => {
    const { service } = makeService({
      targetKind: 'shop',
      targetStatus: 'active',
    });
    await expect(service.listForAdmin(true, 'weird')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('пустой фильтр → open по умолчанию', async () => {
    const { service, prisma } = makeService({
      targetKind: 'shop',
      targetStatus: 'active',
    });
    await service.listForAdmin(true, undefined);
    expect(prisma.marketReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'open' } }),
    );
  });
});
