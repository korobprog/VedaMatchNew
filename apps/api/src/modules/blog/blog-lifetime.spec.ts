import {
  BLOG_DEFAULT_FEED_LIFETIME_HOURS,
  BLOG_MAX_FEED_LIFETIME_HOURS,
  BLOG_MIN_FEED_LIFETIME_HOURS,
} from '@vedamatch/shared';
import {
  clampFeedLifetimeHours,
  feedUntilFrom,
  hoursLeftInFeed,
  isInFeed,
} from './blog-lifetime';

const NOW = new Date('2026-09-21T12:00:00.000Z');

describe('clampFeedLifetimeHours', () => {
  it('keeps a value inside the allowed range', () => {
    expect(clampFeedLifetimeHours(24)).toBe(24);
    expect(clampFeedLifetimeHours(BLOG_MIN_FEED_LIFETIME_HOURS)).toBe(
      BLOG_MIN_FEED_LIFETIME_HOURS,
    );
    expect(clampFeedLifetimeHours(BLOG_MAX_FEED_LIFETIME_HOURS)).toBe(
      BLOG_MAX_FEED_LIFETIME_HOURS,
    );
  });

  // Ноль — это «без срока», а не «исчезнуть немедленно»: договорённость,
  // из-за которой админу не нужен отдельный флажок рядом с числом.
  it('treats zero and anything below it as "no limit"', () => {
    expect(clampFeedLifetimeHours(0)).toBe(0);
    expect(clampFeedLifetimeHours(-5)).toBe(0);
  });

  it('caps a value above the maximum', () => {
    expect(clampFeedLifetimeHours(BLOG_MAX_FEED_LIFETIME_HOURS + 1000)).toBe(
      BLOG_MAX_FEED_LIFETIME_HOURS,
    );
  });

  it('rounds fractions towards zero', () => {
    expect(clampFeedLifetimeHours(5.9)).toBe(5);
    expect(clampFeedLifetimeHours(0.5)).toBe(0);
  });

  // Срок не то поле, ради которого стоит ронять публикацию поста.
  it('falls back to the default on garbage', () => {
    expect(clampFeedLifetimeHours(undefined)).toBe(
      BLOG_DEFAULT_FEED_LIFETIME_HOURS,
    );
    expect(clampFeedLifetimeHours('24')).toBe(BLOG_DEFAULT_FEED_LIFETIME_HOURS);
    expect(clampFeedLifetimeHours(Number.NaN)).toBe(
      BLOG_DEFAULT_FEED_LIFETIME_HOURS,
    );
    expect(clampFeedLifetimeHours(Number.POSITIVE_INFINITY)).toBe(
      BLOG_DEFAULT_FEED_LIFETIME_HOURS,
    );
  });
});

describe('feedUntilFrom', () => {
  it('adds the lifetime to the publication moment', () => {
    expect(feedUntilFrom(NOW, 3)?.toISOString()).toBe(
      '2026-09-21T15:00:00.000Z',
    );
  });

  it('returns null for an unlimited lifetime', () => {
    expect(feedUntilFrom(NOW, 0)).toBeNull();
  });

  it('never returns a moment in the past', () => {
    const until = feedUntilFrom(NOW, BLOG_MIN_FEED_LIFETIME_HOURS);
    expect(until).not.toBeNull();
    expect(until!.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe('isInFeed', () => {
  it('keeps a post without a deadline forever', () => {
    expect(isInFeed(null, NOW)).toBe(true);
  });

  it('keeps a post whose deadline is still ahead', () => {
    expect(isInFeed(new Date('2026-09-21T12:00:01.000Z'), NOW)).toBe(true);
  });

  // Граница исключающая — так же, как условие `feedUntil > now` в запросе.
  // Иначе виджет и база разошлись бы ровно в момент истечения срока.
  it('drops a post exactly at its deadline', () => {
    expect(isInFeed(new Date(NOW), NOW)).toBe(false);
  });

  it('drops a post past its deadline', () => {
    expect(isInFeed(new Date('2026-09-21T11:59:59.000Z'), NOW)).toBe(false);
  });
});

describe('hoursLeftInFeed', () => {
  it('reports null for an unlimited post', () => {
    expect(hoursLeftInFeed(null, NOW)).toBeNull();
  });

  it('rounds the remainder up so "ещё 1 ч" never reads as zero', () => {
    expect(hoursLeftInFeed(new Date('2026-09-21T12:00:01.000Z'), NOW)).toBe(1);
    expect(hoursLeftInFeed(new Date('2026-09-21T13:30:00.000Z'), NOW)).toBe(2);
  });

  it('reports zero for an expired post', () => {
    expect(hoursLeftInFeed(new Date('2026-09-21T10:00:00.000Z'), NOW)).toBe(0);
    expect(hoursLeftInFeed(new Date(NOW), NOW)).toBe(0);
  });
});
