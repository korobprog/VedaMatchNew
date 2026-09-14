import { devApiOrigin } from './dev-origin';

const PROD = ['https://api.vedamatch.ru', 'https://api.vedamatch.com'];

describe('devApiOrigin', () => {
  it('подменяет продовый адрес хостом Metro', () => {
    expect(devApiOrigin('http://10.0.2.2:8081/index.bundle?platform=android', 'https://api.vedamatch.ru', PROD)).toBe(
      'http://10.0.2.2:4000',
    );
    expect(devApiOrigin('http://192.168.1.67:8081/x', 'https://api.vedamatch.com', PROD)).toBe('http://192.168.1.67:4000');
  });

  it('не трогает адрес, заданный явно при сборке', () => {
    expect(devApiOrigin('http://10.0.2.2:8081/x', 'http://10.0.2.2:4100', PROD)).toBe('http://10.0.2.2:4100');
  });

  it('без адреса бандла или с мусором оставляет как есть', () => {
    expect(devApiOrigin(null, 'https://api.vedamatch.ru', PROD)).toBe('https://api.vedamatch.ru');
    expect(devApiOrigin('assets://index.bundle', 'https://api.vedamatch.ru', PROD)).toBe('https://api.vedamatch.ru');
    expect(devApiOrigin('not a url', 'https://api.vedamatch.ru', PROD)).toBe('https://api.vedamatch.ru');
  });
});
