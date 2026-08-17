import { NOTICE_RENEW_WINDOW_DAYS } from '@vedamatch/shared';
import {
  DEFAULT_TTL_DAYS,
  canRenew,
  isLive,
  renewedExpiresAt,
  resolveExpiresAt,
} from './notice-expiry';

const now = new Date('2026-08-17T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(now.getTime() + days * DAY);

describe('resolveExpiresAt', () => {
  it('обычное объявление живёт срок своего вида', () => {
    expect(resolveExpiresAt({ kind: 'offer' }, now)).toEqual(
      inDays(DEFAULT_TTL_DAYS.offer),
    );
    expect(resolveExpiresAt({ kind: 'info' }, now)).toEqual(
      inDays(DEFAULT_TTL_DAYS.info),
    );
  });

  it('событие живёт до своего конца, а не месяц с публикации', () => {
    // Афиша фестиваля через полгода не должна исчезнуть за месяц до него.
    const startsAt = inDays(180);
    expect(resolveExpiresAt({ kind: 'event', startsAt }, now)).toEqual(
      new Date(startsAt.getTime() + DAY),
    );
  });

  it('у события с концом срок считается от конца', () => {
    const startsAt = inDays(10);
    const endsAt = inDays(12);
    expect(resolveExpiresAt({ kind: 'event', startsAt, endsAt }, now)).toEqual(
      new Date(endsAt.getTime() + DAY),
    );
  });

  it('событие без даты живёт по общему правилу', () => {
    expect(resolveExpiresAt({ kind: 'event', startsAt: null }, now)).toEqual(
      inDays(DEFAULT_TTL_DAYS.event),
    );
  });
});

describe('canRenew', () => {
  it('раньше окна продлевать нечего', () => {
    // Иначе «продлить» превратилось бы в кнопку «поднять в топ».
    expect(canRenew(inDays(NOTICE_RENEW_WINDOW_DAYS + 1), now, 'offer')).toBe(
      false,
    );
  });

  it('внутри окна и после протухания — можно', () => {
    expect(canRenew(inDays(NOTICE_RENEW_WINDOW_DAYS), now, 'offer')).toBe(true);
    expect(canRenew(inDays(1), now, 'request')).toBe(true);
    expect(canRenew(inDays(-5), now, 'offer')).toBe(true);
  });

  it('прошедшее событие не продлевают — у него новая дата, а не срок', () => {
    expect(canRenew(inDays(-1), now, 'event', inDays(-3))).toBe(false);
  });
});

describe('renewedExpiresAt', () => {
  it('отсчитывается от «сейчас», а не от старого срока', () => {
    // Иначе продление просроченного не давало бы ему ни дня жизни.
    expect(renewedExpiresAt('offer', now)).toEqual(
      inDays(DEFAULT_TTL_DAYS.offer),
    );
  });
});

describe('isLive', () => {
  it('живость определяется данными, а не работой воркера', () => {
    expect(isLive('published', inDays(1), now)).toBe(true);
    expect(isLive('published', inDays(-1), now)).toBe(false);
    expect(isLive('hidden_by_author', inDays(1), now)).toBe(false);
    expect(isLive('expired', inDays(1), now)).toBe(false);
  });
});
