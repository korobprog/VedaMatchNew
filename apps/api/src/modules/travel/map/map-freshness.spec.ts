import {
  TRAVEL_MAP_CLOSED_WINDOW_DAYS,
  TRAVEL_MAP_STALE_DAYS,
} from '@vedamatch/shared';
import { buildFreshness, closedWindowStart, isStale } from './map-freshness';

const now = new Date('2026-09-30T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('isStale', () => {
  it('свежая правка без подтверждения — не протухло', () => {
    expect(
      isStale(now, { lastConfirmedAt: null, updatedAt: daysAgo(10) }),
    ).toBe(false);
  });

  it('и подтверждение, и правка старше порога — протухло', () => {
    const old = daysAgo(TRAVEL_MAP_STALE_DAYS + 1);
    expect(isStale(now, { lastConfirmedAt: old, updatedAt: old })).toBe(true);
    expect(isStale(now, { lastConfirmedAt: null, updatedAt: old })).toBe(true);
  });

  it('берётся более свежая из двух дат', () => {
    const old = daysAgo(TRAVEL_MAP_STALE_DAYS + 30);
    expect(isStale(now, { lastConfirmedAt: daysAgo(5), updatedAt: old })).toBe(
      false,
    );
    expect(isStale(now, { lastConfirmedAt: old, updatedAt: daysAgo(5) })).toBe(
      false,
    );
  });
});

describe('closedWindowStart', () => {
  it('отступает на окно голосов', () => {
    expect(closedWindowStart(now)).toEqual(
      daysAgo(TRAVEL_MAP_CLOSED_WINDOW_DAYS),
    );
  });
});

describe('buildFreshness', () => {
  it('собирает DTO с ISO-датой и признаком stale', () => {
    const old = daysAgo(TRAVEL_MAP_STALE_DAYS + 1);
    expect(
      buildFreshness(
        {
          lastConfirmedAt: null,
          updatedAt: old,
          confirmations: 3,
          closedVotes: 1,
          myVerdict: 'closed',
        },
        now,
      ),
    ).toEqual({
      lastConfirmedAt: null,
      confirmations: 3,
      closedVotes: 1,
      stale: true,
      myVerdict: 'closed',
    });
    const confirmed = daysAgo(2);
    expect(
      buildFreshness(
        {
          lastConfirmedAt: confirmed,
          updatedAt: old,
          confirmations: 1,
          closedVotes: 0,
          myVerdict: null,
        },
        now,
      ).lastConfirmedAt,
    ).toBe(confirmed.toISOString());
  });
});
