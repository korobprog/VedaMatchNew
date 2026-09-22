import {
  describeWebPushSection,
  isIosDevice,
  isStandaloneDisplay,
} from './web-push-state';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const MAC = IPAD_AS_MAC;
const ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

describe('isIosDevice', () => {
  it('iPhone узнаётся по строке браузера', () => {
    expect(isIosDevice(IPHONE, 5)).toBe(true);
  });

  it('iPad представляется маком — отличает сенсорный экран', () => {
    expect(isIosDevice(IPAD_AS_MAC, 5)).toBe(true);
    expect(isIosDevice(MAC, 0)).toBe(false);
  });

  it('Android — не iOS', () => {
    expect(isIosDevice(ANDROID, 5)).toBe(false);
  });
});

describe('isStandaloneDisplay', () => {
  it('достаточно любого из двух признаков', () => {
    expect(
      isStandaloneDisplay({ displayModeStandalone: true, navigatorStandalone: false }),
    ).toBe(true);
    // Safari отвечает своим navigator.standalone, медиазапрос может молчать.
    expect(
      isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true }),
    ).toBe(true);
  });

  it('вкладка браузера — ни того, ни другого', () => {
    expect(
      isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: false }),
    ).toBe(false);
  });
});

describe('describeWebPushSection', () => {
  it('iPhone во вкладке Safari: объяснение про домашний экран, а не кнопка', () => {
    const state = describeWebPushSection({ support: 'default', standalone: false, ios: true });
    expect(state.kind).toBe('install-first');
    expect(state.showEnableButton).toBe(false);
    expect(state.hint).toContain('домашний экран');
    expect(state.steps.length).toBeGreaterThan(1);
    expect(state.steps[0]).toContain('Поделиться');
  });

  it('iPhone во вкладке: «браузер не умеет» не показываем, хотя Notification там нет', () => {
    // Главная ловушка задачи: в обычной вкладке Safari `Notification` не
    // существует, и без приоритета этой ветки человек прочёл бы приговор
    // вместо инструкции.
    const state = describeWebPushSection({
      support: 'unsupported',
      standalone: false,
      ios: true,
    });
    expect(state.kind).toBe('install-first');
  });

  it('iPhone с домашнего экрана, разрешение не спрашивали: кнопка', () => {
    const state = describeWebPushSection({ support: 'default', standalone: true, ios: true });
    expect(state.kind).toBe('enable');
    expect(state.showEnableButton).toBe(true);
    expect(state.steps).toEqual([]);
  });

  it('разрешение выдано: ничего делать не надо', () => {
    const state = describeWebPushSection({ support: 'granted', standalone: true, ios: true });
    expect(state.kind).toBe('enabled');
    expect(state.showEnableButton).toBe(false);
  });

  it('запрет: на iPhone отправляем в настройки телефона, иначе в настройки браузера', () => {
    const ios = describeWebPushSection({ support: 'denied', standalone: true, ios: true });
    expect(ios.kind).toBe('blocked');
    expect(ios.hint).toContain('настройках телефона');

    const other = describeWebPushSection({ support: 'denied', standalone: false, ios: false });
    expect(other.kind).toBe('blocked');
    expect(other.hint).toContain('настройках браузера');
  });

  it('Android во вкладке работает без домашнего экрана', () => {
    const state = describeWebPushSection({ support: 'default', standalone: false, ios: false });
    expect(state.kind).toBe('enable');
    expect(state.showEnableButton).toBe(true);
  });

  it('браузер без уведомлений (не iOS): честное «не умеет»', () => {
    const state = describeWebPushSection({
      support: 'unsupported',
      standalone: false,
      ios: false,
    });
    expect(state.kind).toBe('unsupported');
    expect(state.showEnableButton).toBe(false);
  });
});
