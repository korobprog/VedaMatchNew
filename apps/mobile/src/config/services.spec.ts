import { SERVICE_LINKS, serviceUrl } from './services';

describe('serviceUrl', () => {
  it('склеивает origin и путь ровно одним слэшем', () => {
    expect(serviceUrl('https://vedamatch.ru', '/union')).toBe('https://vedamatch.ru/union');
    expect(serviceUrl('https://vedamatch.com/', 'market')).toBe('https://vedamatch.com/market');
  });
});

describe('SERVICE_LINKS', () => {
  it('ключи уникальны, пути абсолютные', () => {
    const keys = SERVICE_LINKS.map((link) => link.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const link of SERVICE_LINKS) expect(link.path.startsWith('/')).toBe(true);
  });
});
