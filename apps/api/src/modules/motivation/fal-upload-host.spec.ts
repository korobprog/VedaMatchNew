import { hostOf } from './fal-video.service';

describe('hostOf', () => {
  it('оставляет от подписанной ссылки только хост', () => {
    // Подпись в query — одноразовый доступ на запись, в логах ей не место.
    expect(
      hostOf('https://v3.fal.media/upload/abc?signature=secret&expires=123'),
    ).toBe('v3.fal.media');
  });

  it('сохраняет порт, если он есть', () => {
    expect(hostOf('https://storage.test:8443/put')).toBe('storage.test:8443');
  });

  it('не падает на мусоре вместо ссылки', () => {
    expect(hostOf('не ссылка')).toBe('неразобранный url');
    expect(hostOf('')).toBe('неразобранный url');
  });
});
