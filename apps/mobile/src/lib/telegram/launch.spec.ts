import { readTelegramLaunch, TELEGRAM_WEB_APP_SCRIPT } from './launch';

const INIT = 'auth_date=1800000000&user=%7B%22id%22%3A42%7D&hash=abc';

describe('readTelegramLaunch', () => {
  it('достаёт данные запуска из адреса, который открыл Telegram', () => {
    const hash = `#tgWebAppData=${encodeURIComponent(INIT)}&tgWebAppVersion=8.0&tgWebAppPlatform=ios`;
    expect(readTelegramLaunch(hash)).toEqual({ initData: INIT, platform: 'ios', version: '8.0' });
  });

  it('обычный Safari — не Telegram', () => {
    expect(readTelegramLaunch('')).toBeNull();
    expect(readTelegramLaunch('#section')).toBeNull();
    expect(readTelegramLaunch('#tgWebAppVersion=8.0')).toBeNull();
    expect(readTelegramLaunch('#tgWebAppData=')).toBeNull();
  });

  it('слишком длинные данные не принимаются', () => {
    expect(readTelegramLaunch(`#tgWebAppData=${'a'.repeat(10_001)}`)).toBeNull();
  });

  it('скрипт Telegram — только с его домена по https', () => {
    expect(new URL(TELEGRAM_WEB_APP_SCRIPT).origin).toBe('https://telegram.org');
  });
});
