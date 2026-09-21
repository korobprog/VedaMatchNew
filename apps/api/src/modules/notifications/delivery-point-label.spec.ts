import {
  describeAppDevice,
  describeWebSubscription,
} from './delivery-point-label';

describe('describeWebSubscription', () => {
  it('Chrome на Android', () => {
    expect(
      describeWebSubscription(
        'Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome, Android');
  });

  it('Safari на iPhone не путается с Chrome', () => {
    expect(
      describeWebSubscription(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari, iOS');
  });

  it('Edge представляется и как Chrome — узнаётся Edge', () => {
    expect(
      describeWebSubscription(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      ),
    ).toBe('Edge, Windows');
  });

  it('Яндекс.Браузер узнаётся раньше Chrome', () => {
    expect(
      describeWebSubscription(
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/118.0.0.0 YaBrowser/23.11.0.0 Safari/537.36',
      ),
    ).toBe('Яндекс.Браузер, Windows');
  });

  it('без user-agent — просто «Браузер»: строка приходит от клиента', () => {
    expect(describeWebSubscription(null)).toBe('Браузер');
    expect(describeWebSubscription('   ')).toBe('Браузер');
    expect(describeWebSubscription('какой-то бот')).toBe('Браузер');
  });

  it('известна только платформа — показываем её', () => {
    expect(describeWebSubscription('Mozilla/5.0 (Windows NT 10.0)')).toBe(
      'Windows',
    );
  });
});

describe('describeAppDevice', () => {
  it('платформа, служба доставки и сборка', () => {
    expect(
      describeAppDevice({
        provider: 'fcm',
        platform: 'android',
        appVariant: 'ru-site',
      }),
    ).toBe('Android · FCM · ru-site');
  });

  it('без сборки — две части', () => {
    expect(
      describeAppDevice({
        provider: 'rustore',
        platform: 'android',
        appVariant: null,
      }),
    ).toBe('Android · RuStore');
  });

  it('iOS', () => {
    expect(
      describeAppDevice({ provider: 'fcm', platform: 'ios', appVariant: null }),
    ).toBe('iOS · FCM');
  });
});
