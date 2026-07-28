import { toActivityLevel } from './union-activity';

const now = new Date('2026-07-28T12:00:00.000Z');

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

describe('toActivityLevel', () => {
  it.each([
    [1, 'online'],
    [14, 'online'],
    [16, 'today'],
    [23 * 60, 'today'],
    [25 * 60, 'week'],
    [6 * 24 * 60, 'week'],
    [8 * 24 * 60, 'long_ago'],
  ] as const)('maps %i minutes ago to %s', (minutes, expected) => {
    expect(toActivityLevel(minutesAgo(minutes), now)).toBe(expected);
  });

  it('returns null for a user who never signed in', () => {
    expect(toActivityLevel(null, now)).toBeNull();
  });
});
