import { resolveWebSessionStrategy } from './telegram-web-session-strategy';

describe('resolveWebSessionStrategy', () => {
  it('обычный браузер — cookie', () => {
    expect(resolveWebSessionStrategy(false)).toBe('cookie');
  });

  it('запущено внутри Telegram — токены, cookie не используются', () => {
    expect(resolveWebSessionStrategy(true)).toBe('telegram-token');
  });
});
