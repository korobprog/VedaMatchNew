import {
  sameApplicationServerKey,
  toSubscriptionRequest,
  urlBase64ToUint8Array,
} from './web-push-subscription';

describe('urlBase64ToUint8Array', () => {
  it('читает url-safe алфавит и восстанавливает паддинг', () => {
    // «-» и «_» вместо «+» и «/», длина не кратна четырём.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
    expect(Array.from(urlBase64ToUint8Array('AAECAw'))).toEqual([0, 1, 2, 3]);
  });

  it('ключ VAPID длиной 87 знаков разворачивается в 65 байт', () => {
    // Столько отдаёт продовый `GET /notifications/vapid-key`: несжатая точка
    // кривой P-256 — 65 байт, в base64url это 87 знаков без паддинга.
    const key = 'B'.repeat(87);
    expect(urlBase64ToUint8Array(key)).toHaveLength(65);
  });
});

describe('toSubscriptionRequest', () => {
  it('берёт endpoint и ключи из toJSON()', () => {
    const subscription = {
      endpoint: 'https://push.example/other',
      toJSON: () => ({
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    } as unknown as PushSubscription;

    expect(toSubscriptionRequest(subscription)).toEqual({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('без ключей в toJSON() отдаёт пустые строки, а endpoint берёт у подписки', () => {
    const subscription = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({}),
    } as unknown as PushSubscription;

    expect(toSubscriptionRequest(subscription)).toEqual({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: '', auth: '' },
    });
  });
});

describe('sameApplicationServerKey', () => {
  const key = new Uint8Array([1, 2, 3]);

  it('те же байты — та же подписка', () => {
    expect(sameApplicationServerKey(new Uint8Array([1, 2, 3]).buffer, key)).toBe(true);
  });

  it('другие байты или другая длина — подписку надо пересоздать', () => {
    expect(sameApplicationServerKey(new Uint8Array([1, 2, 4]).buffer, key)).toBe(false);
    expect(sameApplicationServerKey(new Uint8Array([1, 2]).buffer, key)).toBe(false);
  });

  it('ключа нет вовсе — считаем чужим', () => {
    expect(sameApplicationServerKey(null, key)).toBe(false);
    expect(sameApplicationServerKey(undefined, key)).toBe(false);
  });
});
