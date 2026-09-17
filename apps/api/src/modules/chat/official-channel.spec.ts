import { officialMembership } from './official-channel';

describe('officialMembership', () => {
  const now = new Date('2026-09-14T12:00:00Z');

  it('участник читает канал без уведомлений', () => {
    const membership = officialMembership('user', now);
    expect(membership.role).toBe('member');
    expect(membership.mutedUntil?.getFullYear()).toBe(2126);
  });

  it('администратор портала пишет и получает уведомления', () => {
    expect(officialMembership('admin', now)).toEqual({
      role: 'admin',
      mutedUntil: null,
    });
  });

  it('неизвестная роль считается участником', () => {
    expect(officialMembership(undefined, now).role).toBe('member');
  });
});
