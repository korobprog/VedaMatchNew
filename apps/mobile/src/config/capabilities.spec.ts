import { CAPABILITY_KEYS, capabilitiesFor, type AppCapabilities } from './capabilities';
import { CAPABILITY_LABELS } from './store-safety';
import { resolveVariant } from './variant';

/** Все четыре сборки: два контура на два канала. */
const BUILDS = [
  { contour: 'ru', channel: 'site' },
  { contour: 'ru', channel: 'store' },
  { contour: 'com', channel: 'site' },
  { contour: 'com', channel: 'store' },
] as const;

function capabilitiesOf(contour: string, channel: string): AppCapabilities {
  return capabilitiesFor(resolveVariant({ APP_CONTOUR: contour, APP_CHANNEL: channel }));
}

describe('capabilitiesFor', () => {
  it('сборка с сайта умеет всё', () => {
    expect(capabilitiesOf('ru', 'site')).toEqual({
      selfUpdate: true,
      inAppPayments: true,
      paidWebLinks: true,
      apkDownloadPrompt: true,
      siteServiceLinks: true,
    });
  });

  it('сборка витрины: ни самообновления, ни оплаты, ни ссылок на платное, ни APK с сайта', () => {
    expect(capabilitiesOf('ru', 'store')).toEqual({
      selfUpdate: false,
      inAppPayments: false,
      paidWebLinks: false,
      apkDownloadPrompt: false,
      siteServiceLinks: true,
    });
  });

  // Ссылки на бесплатные разделы правилами витрин не запрещены
  // (docs/mobile-app-store-links.md) — единственная возможность, которая
  // есть у обоих каналов. Строка здесь, чтобы её случайное выключение было
  // видно как падение теста, а не как молча пропавший каталог «Сервисы».
  it('каталог сервисов открывается на сайте из обеих сборок', () => {
    expect(capabilitiesOf('ru', 'store').siteServiceLinks).toBe(true);
    expect(capabilitiesOf('com', 'site').siteServiceLinks).toBe(true);
  });

  it('контур на возможности не влияет — правила витрин одинаковы для ru и com', () => {
    expect(capabilitiesOf('com', 'site')).toEqual(capabilitiesOf('ru', 'site'));
    expect(capabilitiesOf('com', 'store')).toEqual(capabilitiesOf('ru', 'store'));
  });

  it('у витрины возможностей строго меньше, чем у сайта, и ни одной своей', () => {
    for (const { contour } of BUILDS) {
      const site = capabilitiesOf(contour, 'site');
      const store = capabilitiesOf(contour, 'store');
      for (const key of CAPABILITY_KEYS) {
        if (store[key]) expect(site[key]).toBe(true);
      }
      expect(CAPABILITY_KEYS.some((key) => site[key] && !store[key])).toBe(true);
    }
  });

  it('каждая сборка описана полностью — ни одной пропущенной возможности', () => {
    for (const { contour, channel } of BUILDS) {
      const capabilities = capabilitiesOf(contour, channel);
      expect(Object.keys(capabilities).sort()).toEqual([...CAPABILITY_KEYS].sort());
      for (const key of CAPABILITY_KEYS) {
        expect(typeof capabilities[key]).toBe('boolean');
      }
    }
  });

  it('у каждой возможности есть человеческое имя для сообщений проверок', () => {
    expect(Object.keys(CAPABILITY_LABELS).sort()).toEqual([...CAPABILITY_KEYS].sort());
    for (const key of CAPABILITY_KEYS) expect(CAPABILITY_LABELS[key].length).toBeGreaterThan(0);
  });

  it('возвращает копию — испортить таблицу вызывающий код не может', () => {
    const first = capabilitiesFor({ channel: 'store' });
    first.inAppPayments = true;
    expect(capabilitiesFor({ channel: 'store' }).inAppPayments).toBe(false);
  });

  it('незнакомый канал — ошибка, а не пустой набор возможностей', () => {
    expect(() => capabilitiesFor({ channel: 'play' as never })).toThrow('не описан в таблице возможностей');
  });
});
