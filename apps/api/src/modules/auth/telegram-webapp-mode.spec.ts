import { BadRequestException } from '@nestjs/common';
import { parseTelegramWebAppMode } from './telegram-webapp-mode';

describe('parseTelegramWebAppMode', () => {
  it('поле отсутствует — cookie (поведение по умолчанию)', () => {
    expect(parseTelegramWebAppMode(undefined)).toBe('cookie');
  });

  it("'token' — режим токенов", () => {
    expect(parseTelegramWebAppMode('token')).toBe('token');
  });

  it.each(['cookie', 'Token', 'TOKEN', '', 1, true, null, {}])(
    'что угодно ещё (%p) — 400',
    (value) => {
      expect(() => parseTelegramWebAppMode(value)).toThrow(BadRequestException);
    },
  );
});
