import { VACANCY_RENEW_WINDOW_DAYS } from '@vedamatch/shared';
import {
  DEFAULT_TTL_DAYS,
  canRenew,
  isLive,
  renewedExpiresAt,
  resolveExpiresAt,
} from './vacancy-expiry';

const now = new Date('2026-09-08T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(now.getTime() + days * DAY);

describe('resolveExpiresAt', () => {
  it('работа и служение без даты живут срок своего вида', () => {
    expect(resolveExpiresAt({ kind: 'work' }, now)).toEqual(
      inDays(DEFAULT_TTL_DAYS.work),
    );
    expect(resolveExpiresAt({ kind: 'seva', sevaUntil: null }, now)).toEqual(
      inDays(DEFAULT_TTL_DAYS.seva),
    );
  });

  it('задача с дедлайном живёт до него, а не две недели', () => {
    // «Помочь на фестивале 20-го» бесполезно 21-го, а задача через три
    // месяца не должна исчезнуть за месяц до срока.
    const dueAt = inDays(90);
    expect(resolveExpiresAt({ kind: 'task', dueAt }, now)).toEqual(
      new Date(dueAt.getTime() + DAY),
    );
  });

  it('служение «до даты» живёт до неё', () => {
    const sevaUntil = inDays(3);
    expect(resolveExpiresAt({ kind: 'seva', sevaUntil }, now)).toEqual(
      new Date(sevaUntil.getTime() + DAY),
    );
  });

  it('дата чужого вида на срок не влияет', () => {
    // dueAt у работы — мусор в теле запроса, а не якорь срока.
    expect(resolveExpiresAt({ kind: 'work', dueAt: inDays(1) }, now)).toEqual(
      inDays(DEFAULT_TTL_DAYS.work),
    );
  });
});

describe('canRenew', () => {
  it('раньше окна продлевать нечего', () => {
    expect(
      canRenew(inDays(VACANCY_RENEW_WINDOW_DAYS + 1), now, { kind: 'work' }),
    ).toBe(false);
  });

  it('внутри окна и после протухания — можно', () => {
    expect(
      canRenew(inDays(VACANCY_RENEW_WINDOW_DAYS), now, { kind: 'work' }),
    ).toBe(true);
    expect(canRenew(inDays(-5), now, { kind: 'seva' })).toBe(true);
  });

  it('привязанное к дате не продлевается', () => {
    expect(canRenew(inDays(-1), now, { kind: 'task', dueAt: inDays(-2) })).toBe(
      false,
    );
    expect(
      canRenew(inDays(-1), now, { kind: 'seva', sevaUntil: inDays(-2) }),
    ).toBe(false);
  });
});

describe('renewedExpiresAt', () => {
  it('считается от «сейчас», а не от старого срока', () => {
    expect(renewedExpiresAt('task', now)).toEqual(
      inDays(DEFAULT_TTL_DAYS.task),
    );
  });
});

describe('isLive', () => {
  it('живо только опубликованное и не протухшее', () => {
    expect(isLive('published', inDays(1), now)).toBe(true);
    expect(isLive('published', inDays(-1), now)).toBe(false);
    expect(isLive('closed', inDays(1), now)).toBe(false);
  });
});
