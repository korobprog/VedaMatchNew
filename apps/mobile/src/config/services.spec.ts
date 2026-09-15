import { serviceUrl } from './services';

describe('serviceUrl', () => {
  it('склеивает origin и путь ровно одним слэшем', () => {
    expect(serviceUrl('https://vedamatch.ru', '/union')).toBe('https://vedamatch.ru/union');
    expect(serviceUrl('https://vedamatch.com/', 'market')).toBe('https://vedamatch.com/market');
  });
});
