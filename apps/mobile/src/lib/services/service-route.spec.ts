import { hasInAppScreen, serviceTarget } from './service-route';

describe('serviceTarget', () => {
  it('«Здоровье» открывается в приложении: в браузере телефона камеры нет', () => {
    expect(serviceTarget({ slug: 'wellness', url: '/wellness' })).toEqual({
      kind: 'in-app',
      path: '/wellness',
    });
  });

  it('карточка ведёт в РАЗДЕЛ, а не сразу в сканер', () => {
    // Сканер — одно из средств «Здоровья»; следующему нужно место рядом, а
    // не кнопка внутри чужого экрана (VED-335, третий заход).
    const target = serviceTarget({ slug: 'wellness', url: '/wellness' });
    expect(target.kind === 'in-app' && target.path).not.toBe('/wellness/scan');
  });

  it('«Блог-лента» открывается своими экранами — ленту не отправляют в браузер (VED-334)', () => {
    expect(serviceTarget({ slug: 'blog', url: '/blog' })).toEqual({ kind: 'in-app', path: '/blog' });
    expect(hasInAppScreen('blog')).toBe(true);
  });

  it('Медиатека в приложении — своими экранами, в веб-сборке — сайтом (VED-331)', () => {
    expect(serviceTarget({ slug: 'music', url: '/music' }, 'android')).toEqual({ kind: 'in-app', path: '/music' });
    expect(serviceTarget({ slug: 'music', url: '/music' }, 'web')).toEqual({ kind: 'site', url: '/music' });
    expect(hasInAppScreen('music', 'android')).toBe(true);
    expect(hasInAppScreen('music', 'web')).toBe(false);
    // Остальные свои экраны веб-сборка не теряет.
    expect(serviceTarget({ slug: 'blog', url: '/blog' }, 'web').kind).toBe('in-app');
  });

  it('Знакомства открываются своими экранами — в раздел, а не сразу в колоду', () => {
    expect(serviceTarget({ slug: 'union', url: '/union' }, 'android')).toEqual({ kind: 'in-app', path: '/union' });
    expect(hasInAppScreen('union', 'android')).toBe(true);
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
