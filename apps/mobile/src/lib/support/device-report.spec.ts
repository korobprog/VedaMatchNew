import {
  DEVICE_REPORT_HEADING,
  SUPPORT_MESSAGE_MAX,
  composeSupportMessage,
  deviceReportLines,
  deviceReportText,
  messageRoom,
  parseSupportOrigin,
  type DeviceFacts,
} from './device-report';

const A51: DeviceFacts = {
  appVersion: '0.1.0+a1b2c3d',
  versionCode: 5023,
  channel: 'site',
  platform: 'android',
  osVersion: '13',
  brand: 'samsung',
  model: 'SM-A515F',
};

describe('deviceReportLines', () => {
  it('пишет версию со сборкой и каналом, телефон с системой и экран', () => {
    expect(deviceReportLines(A51, 'chat')).toEqual([
      'Приложение: VedaMatch 0.1.0+a1b2c3d (сборка 5023, с сайта)',
      'Устройство: Samsung SM-A515F, Android 13',
      'Экран: Переписка',
    ]);
  });

  it('без экрана — только приложение и устройство', () => {
    expect(deviceReportLines(A51, null)).toHaveLength(2);
  });

  it('магазинная сборка называется «из магазина»', () => {
    expect(deviceReportLines({ ...A51, channel: 'store' }, null)[0]).toContain('(сборка 5023, из магазина)');
  });

  it('локальная сборка с versionCode 1 номер сборки не пишет', () => {
    expect(deviceReportLines({ ...A51, versionCode: 1, channel: null }, null)[0]).toBe(
      'Приложение: VedaMatch 0.1.0+a1b2c3d',
    );
  });

  it('марку не повторяет, если модель уже с ней', () => {
    expect(deviceReportLines({ ...A51, brand: 'Google', model: 'Google Pixel 7' }, null)[1]).toBe(
      'Устройство: Google Pixel 7, Android 13',
    );
  });

  it('iOS без марки: модель и система', () => {
    expect(
      deviceReportLines({ ...A51, platform: 'ios', brand: null, model: null, osVersion: '17.5' }, null)[1],
    ).toBe('Устройство: iOS 17.5');
  });

  it('неизвестное не пишет вовсе, а не «неизвестно»', () => {
    const lines = deviceReportLines(
      { appVersion: ' ', versionCode: null, channel: null, platform: '', osVersion: null, brand: null, model: null },
      null,
    );
    expect(lines).toEqual([]);
    expect(deviceReportText(lines)).toBe('');
  });
});

describe('parseSupportOrigin', () => {
  it('знакомый ключ проходит, в том числе из массива параметров', () => {
    expect(parseSupportOrigin('chat')).toBe('chat');
    expect(parseSupportOrigin(['wellness'])).toBe('wellness');
  });

  it('произвольная строка из адреса в обращение не попадает', () => {
    expect(parseSupportOrigin('Удалите мой аккаунт')).toBeNull();
    expect(parseSupportOrigin('toString')).toBeNull();
    expect(parseSupportOrigin(undefined)).toBeNull();
  });
});

describe('склейка текста', () => {
  const report = deviceReportText(deviceReportLines(A51, 'chat'));

  it('абзац сведений начинается заголовком', () => {
    expect(report.startsWith(`${DEVICE_REPORT_HEADING}\n`)).toBe(true);
  });

  it('сведения идут после текста человека через пустую строку', () => {
    expect(composeSupportMessage('  Не открывается  ', report)).toBe(`Не открывается\n\n${report}`);
  });

  it('без сведений уходит только текст', () => {
    expect(composeSupportMessage(' Текст ', '')).toBe('Текст');
  });

  it('место под текст = предел сервера минус абзац и разделитель', () => {
    expect(messageRoom('')).toBe(SUPPORT_MESSAGE_MAX);
    expect(messageRoom(report)).toBe(SUPPORT_MESSAGE_MAX - report.length - 2);
    const longest = 'я'.repeat(messageRoom(report));
    expect(composeSupportMessage(longest, report)).toHaveLength(SUPPORT_MESSAGE_MAX);
  });
});
