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
      appVersionCode: null,
    });
  });

  it('принимает versionCode сборки — по нему зовут обновиться', () => {
    expect(
      normalizeDeviceRequest({
        token: 't',
        provider: 'fcm',
        platform: 'android',
        appVariant: 'ru-site',
        appVersionCode: 1031,
      }).appVersionCode,
    ).toBe(1031);
  });

  it.each([0, -5, 1.5, '1031', 2_147_483_648])(
    'отвергает versionCode %p: в колонку INTEGER едет только целое больше нуля',
    (appVersionCode) => {
      expect(() =>
        normalizeDeviceRequest({
          token: 't',
          provider: 'fcm',
          platform: 'android',
          appVersionCode,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('null в appVersionCode — то же, что не прислано', () => {
    expect(
      normalizeDeviceRequest({
        token: 't',
        provider: 'fcm',
        platform: 'android',
        appVersionCode: null,
      }).appVersionCode,
    ).toBeNull();
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
