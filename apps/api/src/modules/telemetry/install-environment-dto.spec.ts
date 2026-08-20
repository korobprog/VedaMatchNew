import {
  fromDbValue,
  parseInstallEnvironmentReport,
  toDbValue,
} from './install-environment-dto';

const report = {
  browser: 'yandex-browser',
  platform: 'android',
  displayMode: 'standalone',
  standaloneCapable: false,
};

describe('parseInstallEnvironmentReport', () => {
  it('пропускает корректный замер', () => {
    expect(parseInstallEnvironmentReport(report)).toEqual(report);
  });

  it('отбрасывает лишние поля, а не переносит их в базу', () => {
    expect(
      parseInstallEnvironmentReport({ ...report, userAgent: 'что угодно' }),
    ).toEqual(report);
  });

  it.each([
    ['неизвестный браузер', { ...report, browser: 'netscape' }],
    ['неизвестную платформу', { ...report, platform: 'symbian' }],
    ['неизвестный режим', { ...report, displayMode: 'kiosk' }],
    ['строку вместо флага', { ...report, standaloneCapable: 'false' }],
    ['пустое тело', {}],
    ['не объект', 'yandex-browser'],
    ['null', null],
  ])('отклоняет %s', (_name, body) => {
    expect(parseInstallEnvironmentReport(body)).toBeNull();
  });
});

describe('перевод значений на границе базы', () => {
  it.each([
    ['yandex-browser', 'yandex_browser'],
    ['yandex-app', 'yandex_app'],
    ['minimal-ui', 'minimal_ui'],
    ['chrome', 'chrome'],
    ['android', 'android'],
  ])('%s и %s — одно и то же значение', (wire, db) => {
    expect(toDbValue(wire)).toBe(db);
    expect(fromDbValue(db)).toBe(wire);
  });
});
