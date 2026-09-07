import {
  WORK_INVITE_DEFAULT_DAYS,
  WORK_INVITE_MAX_DAYS,
  createWorkInviteToken,
  hashWorkInviteToken,
  workInviteExpiry,
  workInviteState,
  workInviteStateMessage,
  workInviteUrl,
} from './work-invite';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-07T10:00:00.000Z');

describe('createWorkInviteToken', () => {
  it('токен и его хеш совпадают', () => {
    const { token, tokenHash } = createWorkInviteToken();
    expect(hashWorkInviteToken(token)).toBe(tokenHash);
  });

  it('токен пригоден для URL и не короткий', () => {
    const { token } = createWorkInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('два вызова не совпадают', () => {
    expect(createWorkInviteToken().token).not.toBe(
      createWorkInviteToken().token,
    );
  });
});

describe('workInviteUrl', () => {
  it('собирает ссылку и не удваивает слэш', () => {
    expect(workInviteUrl('https://vedamatch.ru/', 'abc')).toBe(
      'https://vedamatch.ru/work/join/abc',
    );
  });
});

describe('workInviteExpiry', () => {
  it('по умолчанию — неделя', () => {
    expect(workInviteExpiry(NOW).getTime()).toBe(
      NOW.getTime() + WORK_INVITE_DEFAULT_DAYS * DAY,
    );
  });

  it('меньше суток не бывает', () => {
    expect(workInviteExpiry(NOW, 0).getTime()).toBe(NOW.getTime() + DAY);
    expect(workInviteExpiry(NOW, -5).getTime()).toBe(NOW.getTime() + DAY);
  });

  it('дольше предела не живёт', () => {
    expect(workInviteExpiry(NOW, 3650).getTime()).toBe(
      NOW.getTime() + WORK_INVITE_MAX_DAYS * DAY,
    );
  });
});

describe('workInviteState', () => {
  const base = {
    revokedAt: null as Date | null,
    expiresAt: new Date(NOW.getTime() + DAY),
    maxUses: 0,
    useCount: 0,
  };

  it('свежая ссылка действует', () => {
    expect(workInviteState(base, NOW)).toBe('active');
  });

  it('отозванная не действует, даже пока не истекла', () => {
    expect(workInviteState({ ...base, revokedAt: NOW }, NOW)).toBe('revoked');
  });

  it('истёкшая — по времени, включая ровно момент окончания', () => {
    expect(workInviteState({ ...base, expiresAt: NOW }, NOW)).toBe('expired');
  });

  it('исчерпанная — по числу входов', () => {
    expect(workInviteState({ ...base, maxUses: 2, useCount: 2 }, NOW)).toBe(
      'exhausted',
    );
  });

  it('без лимита число входов не мешает', () => {
    expect(workInviteState({ ...base, maxUses: 0, useCount: 99 }, NOW)).toBe(
      'active',
    );
  });

  it('отзыв важнее истечения: причина называется точная', () => {
    expect(
      workInviteState({ ...base, revokedAt: NOW, expiresAt: NOW }, NOW),
    ).toBe('revoked');
  });
});

describe('workInviteStateMessage', () => {
  it('у каждой причины своё объяснение', () => {
    const messages = (['revoked', 'expired', 'exhausted'] as const).map(
      workInviteStateMessage,
    );
    expect(new Set(messages).size).toBe(3);
    expect(messages.every((text) => text.length > 0)).toBe(true);
  });

  it('у действующей ссылки объяснять нечего', () => {
    expect(workInviteStateMessage('active')).toBe('');
  });
});
