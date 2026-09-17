import {
  AUTH_PROVIDERS,
  canUnlink,
  decideLink,
  isAuthProvider,
} from './identity-link';

describe('decideLink', () => {
  it('идентичность свободна — заводим новую', () => {
    expect(decideLink(null, 'u1')).toBe('create');
  });

  it('идентичность уже у этого же человека — no-op', () => {
    expect(decideLink('u1', 'u1')).toBe('noop');
  });

  it('идентичность у другого — отказ', () => {
    expect(decideLink('u2', 'u1')).toBe('conflict');
  });
});

describe('canUnlink', () => {
  it('единственный способ входа отвязать нельзя', () => {
    expect(canUnlink(1)).toBe(false);
  });

  it('есть запасной способ — можно', () => {
    expect(canUnlink(2)).toBe(true);
  });

  it('способов вовсе нет (не должно случаться) — тоже нельзя', () => {
    expect(canUnlink(0)).toBe(false);
  });
});

describe('isAuthProvider', () => {
  it('принимает значения из списка провайдеров', () => {
    for (const provider of AUTH_PROVIDERS) {
      expect(isAuthProvider(provider)).toBe(true);
    }
  });

  it('отклоняет мусор из URL', () => {
    expect(isAuthProvider('apple')).toBe(false);
    expect(isAuthProvider('')).toBe(false);
    expect(isAuthProvider('Google')).toBe(false);
  });
});
