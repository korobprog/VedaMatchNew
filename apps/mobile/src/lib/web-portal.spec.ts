import { resolveVariant } from '@/config/variant';
import {
  openWebPortal,
  webPortalHost,
  webPortalUnavailableMessage,
  webPortalUrl,
} from './web-portal';

describe('webPortalUrl', () => {
  it('российская сборка открывает vedamatch.ru, глобальная — vedamatch.com', () => {
    expect(webPortalUrl(resolveVariant({ APP_CONTOUR: 'ru' }).webOrigin)).toBe('https://vedamatch.ru');
    expect(webPortalUrl(resolveVariant({ APP_CONTOUR: 'com' }).webOrigin)).toBe('https://vedamatch.com');
  });

  it('контур по умолчанию — российский', () => {
    expect(webPortalUrl(resolveVariant({}).webOrigin)).toBe('https://vedamatch.ru');
  });

  it('уважает APP_WEB_ORIGIN отладочной сборки', () => {
    const variant = resolveVariant({ APP_CONTOUR: 'com', APP_WEB_ORIGIN: 'http://10.0.2.2:3000' });
    expect(webPortalUrl(variant.webOrigin)).toBe('http://10.0.2.2:3000');
  });

  it('не оставляет двойной косой на конце', () => {
    expect(webPortalUrl('https://vedamatch.ru//')).toBe('https://vedamatch.ru');
  });
});

describe('webPortalHost', () => {
  it('убирает протокол и хвостовую косую', () => {
    expect(webPortalHost('https://vedamatch.com/')).toBe('vedamatch.com');
    expect(webPortalHost('http://10.0.2.2:3000')).toBe('10.0.2.2:3000');
  });
});

describe('webPortalUnavailableMessage', () => {
  it('называет адрес, который нужно открыть вручную', () => {
    expect(webPortalUnavailableMessage('https://vedamatch.com')).toContain('vedamatch.com');
    expect(webPortalUnavailableMessage('https://vedamatch.com')).not.toContain('https://');
  });
});

describe('openWebPortal', () => {
  function opener(browser: () => Promise<unknown>, link: () => Promise<unknown>) {
    return { openBrowser: jest.fn(browser), openLink: jest.fn(link) };
  }

  const reject = () => Promise.reject(new Error('нет браузера'));
  const resolve = () => Promise.resolve(undefined);

  it('обычный случай: открывает вкладку внутри приложения и не трогает системный браузер', async () => {
    const deps = opener(resolve, resolve);
    await expect(openWebPortal('https://vedamatch.ru', deps)).resolves.toEqual({
      kind: 'opened',
      via: 'browser',
    });
    expect(deps.openBrowser).toHaveBeenCalledWith('https://vedamatch.ru');
    expect(deps.openLink).not.toHaveBeenCalled();
  });

  it('Custom Tabs недоступны — уходит в системный браузер', async () => {
    const deps = opener(reject, resolve);
    await expect(openWebPortal('https://vedamatch.ru', deps)).resolves.toEqual({
      kind: 'opened',
      via: 'link',
    });
    expect(deps.openLink).toHaveBeenCalledWith('https://vedamatch.ru');
  });

  it('браузера на телефоне нет вовсе — сообщение с адресом, без исключения наружу', async () => {
    const deps = opener(reject, reject);
    await expect(openWebPortal('https://vedamatch.com', deps)).resolves.toEqual({
      kind: 'failed',
      message: 'Не удалось открыть браузер. Откройте vedamatch.com вручную.',
    });
  });
});
