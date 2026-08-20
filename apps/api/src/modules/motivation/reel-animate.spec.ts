import { canAnimateReel } from './reel-animate';

const base = {
  stage: 'published',
  hasImage: true,
  videoState: 'none',
  videoEnabled: true,
  videoConfigured: true,
  isAdmin: false,
};

describe('canAnimateReel', () => {
  it('разрешает опубликованный рилс с кадром и без ролика', () => {
    expect(canAnimateReel(base)).toBe(true);
  });

  it('разрешает повтор после сбоя', () => {
    expect(canAnimateReel({ ...base, videoState: 'failed' })).toBe(true);
  });

  it('не даёт заказать второй ролик', () => {
    expect(canAnimateReel({ ...base, videoState: 'ready' })).toBe(false);
    expect(canAnimateReel({ ...base, videoState: 'queued' })).toBe(false);
    expect(canAnimateReel({ ...base, videoState: 'running' })).toBe(false);
  });

  it('требует опубликованного рилса с кадром', () => {
    expect(canAnimateReel({ ...base, stage: 'ai_review' })).toBe(false);
    expect(canAnimateReel({ ...base, hasImage: false })).toBe(false);
  });

  it('выключенная видеогенерация прячет кнопку у автора', () => {
    expect(canAnimateReel({ ...base, videoEnabled: false })).toBe(false);
  });

  it('администратора выключатель не касается', () => {
    expect(
      canAnimateReel({ ...base, videoEnabled: false, isAdmin: true }),
    ).toBe(true);
  });

  it('без ключа fal.ai кнопки нет ни у кого, включая администратора', () => {
    // Очередь без воркера — рилс завис бы в «готовится» навсегда, а поправить
    // это из админки нельзя: ключ живёт в окружении.
    expect(canAnimateReel({ ...base, videoConfigured: false })).toBe(false);
    expect(
      canAnimateReel({ ...base, videoConfigured: false, isAdmin: true }),
    ).toBe(false);
  });
});
