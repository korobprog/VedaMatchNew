import type { MarketOrderStatus } from '@vedamatch/shared';
import {
  FINAL_STATUSES,
  availableTransitions,
  canTransition,
  isFinalStatus,
  transitionTimestamps,
  type OrderActor,
} from './order-transitions';

const ALL_STATUSES: MarketOrderStatus[] = [
  'new_request',
  'accepted',
  'in_progress',
  'completed',
  'declined_by_seller',
  'cancelled_by_buyer',
];
const ACTORS: OrderActor[] = ['buyer', 'seller'];

describe('seller transitions', () => {
  it('accepts or declines a fresh request', () => {
    expect(availableTransitions('new_request', 'seller')).toEqual([
      'accepted',
      'declined_by_seller',
    ]);
  });

  it('can start work, finish it, or back out of an accepted request', () => {
    expect(availableTransitions('accepted', 'seller')).toEqual([
      'in_progress',
      'completed',
      'declined_by_seller',
    ]);
  });

  it('can finish or decline work already in progress', () => {
    expect(availableTransitions('in_progress', 'seller')).toEqual([
      'completed',
      'declined_by_seller',
    ]);
  });

  it('may skip in_progress and complete straight away', () => {
    // Половина сделок на Рынке — «зашёл и забрал»: заставлять продавца
    // отмечать промежуточный статус ради галочки незачем.
    expect(canTransition('accepted', 'completed', 'seller')).toBe(true);
  });
});

describe('buyer transitions', () => {
  it('can cancel while the seller has not started', () => {
    expect(canTransition('new_request', 'cancelled_by_buyer', 'buyer')).toBe(true);
    expect(canTransition('accepted', 'cancelled_by_buyer', 'buyer')).toBe(true);
  });

  // После начала работы продавец уже потратил время: снимать заявку молча
  // нечестно, договариваться нужно в чате.
  it('cannot cancel once work is in progress', () => {
    expect(availableTransitions('in_progress', 'buyer')).toEqual([]);
  });

  it('never accepts, completes or declines', () => {
    for (const status of ALL_STATUSES) {
      const allowed = availableTransitions(status, 'buyer');
      expect(allowed).not.toContain('accepted');
      expect(allowed).not.toContain('completed');
      expect(allowed).not.toContain('declined_by_seller');
      expect(allowed).not.toContain('in_progress');
    }
  });
});

describe('final statuses', () => {
  it('lists exactly the three closing states', () => {
    expect(FINAL_STATUSES).toEqual([
      'completed',
      'declined_by_seller',
      'cancelled_by_buyer',
    ]);
  });

  // Переоткрытие сломало бы отзыв, который опирается на завершённую заявку.
  it('are a dead end for everyone', () => {
    for (const status of FINAL_STATUSES) {
      expect(isFinalStatus(status)).toBe(true);
      for (const actor of ACTORS) {
        expect(availableTransitions(status, actor)).toEqual([]);
      }
    }
  });

  it('treats open statuses as non-final', () => {
    for (const status of ['new_request', 'accepted', 'in_progress'] as const) {
      expect(isFinalStatus(status)).toBe(false);
    }
  });
});

describe('the full matrix', () => {
  it('never allows a status to transition to itself', () => {
    for (const status of ALL_STATUSES) {
      for (const actor of ACTORS) {
        expect(availableTransitions(status, actor)).not.toContain(status);
      }
    }
  });

  it('rejects every transition that is not explicitly allowed', () => {
    let allowed = 0;
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        for (const actor of ACTORS) {
          const ok = canTransition(from, to, actor);
          expect(ok).toBe(availableTransitions(from, actor).includes(to));
          if (ok) allowed += 1;
        }
      }
    }
    // 2 + 1 + 3 + 1 + 2 = 9 разрешённых переходов на всю матрицу из 72.
    expect(allowed).toBe(9);
  });
});

describe('transitionTimestamps', () => {
  const now = new Date('2026-08-15T10:00:00.000Z');

  it('stamps acceptance', () => {
    expect(transitionTimestamps('accepted', now)).toEqual({ acceptedAt: now });
  });

  // Завершение закрывает заявку, поэтому ставит обе метки: отдельного
  // «закрыть» у нас нет.
  it('stamps completion as both completed and closed', () => {
    expect(transitionTimestamps('completed', now)).toEqual({
      completedAt: now,
      closedAt: now,
    });
  });

  it('stamps refusal and cancellation as closed only', () => {
    expect(transitionTimestamps('declined_by_seller', now)).toEqual({
      closedAt: now,
    });
    expect(transitionTimestamps('cancelled_by_buyer', now)).toEqual({
      closedAt: now,
    });
  });

  it('stamps nothing for intermediate statuses', () => {
    expect(transitionTimestamps('in_progress', now)).toEqual({});
    expect(transitionTimestamps('new_request', now)).toEqual({});
  });
});
