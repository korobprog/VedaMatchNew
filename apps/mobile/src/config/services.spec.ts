import { FALLBACK_SERVICES, serviceUrl } from './services';

describe('serviceUrl', () => {
  it('склеивает origin и путь ровно одним слэшем', () => {
    expect(serviceUrl('https://vedamatch.ru', '/union')).toBe('https://vedamatch.ru/union');
    expect(serviceUrl('https://vedamatch.com/', 'market')).toBe('https://vedamatch.com/market');
  });
});

describe('FALLBACK_SERVICES', () => {
  it('слаги уникальны, статус активен, пути абсолютные', () => {
    const slugs = FALLBACK_SERVICES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const service of FALLBACK_SERVICES) {
      expect(service.status).toBe('active');
      expect(service.url.startsWith('/')).toBe(true);
    }
  });

  it('не включает «Общение» — эту вкладку заменяет нативный таб «Чаты»', () => {
    expect(FALLBACK_SERVICES.some((s) => s.slug === 'chat')).toBe(false);
  });
});
