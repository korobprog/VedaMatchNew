import {
  TRAVEL_MAP_CLOSED_WINDOW_DAYS,
  TRAVEL_MAP_STALE_DAYS,
  type TravelMapCheckVerdict,
  type TravelMapFreshnessDto,
} from '@vedamatch/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

interface FreshnessDates {
  lastConfirmedAt: Date | null;
  updatedAt: Date;
}

/**
 * Место «протухло», если и подтверждения, и правки старше года. Берём более
 * свежую из двух дат: автор, поправивший часы работы, место тоже освежил, и
 * гасить метку такому месту незачем.
 */
export function isStale(now: Date, dates: FreshnessDates): boolean {
  const last = Math.max(
    dates.lastConfirmedAt?.getTime() ?? 0,
    dates.updatedAt.getTime(),
  );
  return now.getTime() - last > TRAVEL_MAP_STALE_DAYS * DAY_MS;
}

/** Голоса «закрылось» старше окна не считаются: место могли открыть заново. */
export function closedWindowStart(now: Date): Date {
  return new Date(now.getTime() - TRAVEL_MAP_CLOSED_WINDOW_DAYS * DAY_MS);
}

export function buildFreshness(
  input: FreshnessDates & {
    confirmations: number;
    closedVotes: number;
    myVerdict: TravelMapCheckVerdict | null;
  },
  now: Date,
): TravelMapFreshnessDto {
  return {
    lastConfirmedAt: input.lastConfirmedAt?.toISOString() ?? null,
    confirmations: input.confirmations,
    closedVotes: input.closedVotes,
    stale: isStale(now, input),
    myVerdict: input.myVerdict,
  };
}
