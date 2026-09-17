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
      nativeCalls: false,
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

  it('nativeCalls по умолчанию false, если не прислано', () => {
    expect(
      normalizeDeviceRequest({
        token: 't',
        provider: 'fcm',
        platform: 'android',
      }).nativeCalls,
    ).toBe(false);
  });

  it('принимает nativeCalls: true — умеет нативный экран звонка', () => {
    expect(
      normalizeDeviceRequest({
        token: 't',
        provider: 'fcm',
        platform: 'android',
        nativeCalls: true,
      }).nativeCalls,
    ).toBe(true);
  });

  it.each([
    [{}],
    [{ token: '', provider: 'fcm', platform: 'android' }],
    [{ token: 'x'.repeat(1025), provider: 'fcm', platform: 'android' }],
    [{ token: 't', provider: 'apns', platform: 'android' }],
    [{ token: 't', provider: 'fcm', platform: 'web' }],
    [{ token: 't', provider: 'fcm', platform: 'android', nativeCalls: 'yes' }],
    [null],
  ])('отклоняет %j', (body) => {
    expect(() => normalizeDeviceRequest(body)).toThrow(BadRequestException);
  });
});
