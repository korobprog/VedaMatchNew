import { hasInAppScreen, serviceTarget } from './service-route';

describe('serviceTarget', () => {
  it('«Здоровье» открывается в приложении: в браузере телефона камеры нет', () => {
    expect(serviceTarget({ slug: 'wellness', url: '/wellness' })).toEqual({
      kind: 'in-app',
      path: '/wellness/scan',
    });
  });

  it('остальные сервисы по-прежнему уходят на сайт', () => {
    expect(serviceTarget({ slug: 'market', url: '/market' })).toEqual({
      kind: 'site',
      url: '/market',
    });
    expect(serviceTarget({ slug: 'library', url: '/library' }).kind).toBe('site');
  });

  it('слаг из админки может прийти с регистром и пробелами', () => {
    expect(serviceTarget({ slug: ' Wellness ', url: '/wellness' }).kind).toBe('in-app');
  });

  it('внешний сервис с полным адресом не ломается', () => {
    expect(serviceTarget({ slug: 'vedabase', url: 'https://vedabase.io' })).toEqual({
      kind: 'site',
      url: 'https://vedabase.io',
    });
  });

  it('hasInAppScreen отвечает про тот же список', () => {
    expect(hasInAppScreen('wellness')).toBe(true);
    expect(hasInAppScreen('market')).toBe(false);
    expect(hasInAppScreen('')).toBe(false);
  });

  it('путь экрана — маршрут приложения, а не адрес сайта', () => {
    const target = serviceTarget({ slug: 'wellness', url: '/wellness' });
    expect(target.kind === 'in-app' && target.path.startsWith('/')).toBe(true);
    expect(target.kind === 'in-app' && target.path).not.toContain('http');
  });
});
