import { BadRequestException } from '@nestjs/common';
import { normalizeDeviceRequest } from './device-request';

describe('normalizeDeviceRequest', () => {
  it('пропускает корректный телефон и обрезает пробелы', () => {
    expect(
      normalizeDeviceRequest({
        token: '  abc  ',
        provider: 'fcm',
        platform: 'android',
        appVariant: 'ru-site',
      }),
    ).toEqual({
      token: 'abc',
      provider: 'fcm',
      platform: 'android',
      appVariant: 'ru-site',
    });
  });

  it('сборка необязательна', () => {
    expect(
      normalizeDeviceRequest({
        token: 't',
        provider: 'rustore',
        platform: 'android',
      }).appVariant,
    ).toBeNull();
  });

  it.each([
    [{}],
    [{ token: '', provider: 'fcm', platform: 'android' }],
    [{ token: 'x'.repeat(1025), provider: 'fcm', platform: 'android' }],
    [{ token: 't', provider: 'apns', platform: 'android' }],
    [{ token: 't', provider: 'fcm', platform: 'web' }],
    [null],
  ])('отклоняет %j', (body) => {
    expect(() => normalizeDeviceRequest(body)).toThrow(BadRequestException);
  });
});
