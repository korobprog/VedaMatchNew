import { createHash, createHmac } from 'node:crypto';
import { verifyTelegramWidget } from './telegram-login-widget';

const TOKEN = '123456:LOCAL-test-token-000000000000000000';
const NOW = 1_800_000_000;

function fields(overrides: Record<string, string> = {}) {
  return {
    id: '777000111',
    first_name: 'Радха',
    last_name: 'Деви',
    username: 'radha_devi',
    photo_url: 'https://t.me/i/userpic/320/radha.jpg',
    auth_date: String(NOW - 60),
    ...overrides,
  };
}

/** Подпись по формуле документации виджета — независимо от проверяемого кода. */
function sign(
  values: Record<string, string>,
  token = TOKEN,
): Record<string, string> {
  const dataCheckString = Object.keys(values)
    .sort()
    .map((key) => `${key}=${values[key]}`)
    .join('\n');
  const secret = createHash('sha256').update(token).digest();
  const hash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  return { ...values, hash };
}

function query(overrides: Record<string, string> = {}, token = TOKEN) {
  return sign(fields(overrides), token);
}

const verify = (q: Record<string, unknown>, token = TOKEN, now = NOW) =>
  verifyTelegramWidget({ query: q, botToken: token, nowSec: now });

describe('verifyTelegramWidget', () => {
  it('принимает подлинные данные и отдаёт пользователя', () => {
    expect(verify(query())).toEqual({
      ok: true,
      authDate: NOW - 60,
      user: {
        id: 777000111,
        firstName: 'Радха',
        lastName: 'Деви',
        username: 'radha_devi',
        photoUrl: 'https://t.me/i/userpic/320/radha.jpg',
      },
    });
  });

  it('посторонние параметры (returnTo) не портят подпись и не участвуют в ней', () => {
    const q = {
      ...query(),
      returnTo: '/union/matches',
      returnOrigin: 'https://evil.example',
    };
    expect(verify(q).ok).toBe(true);
  });

  it('подмена одного поля (id) ломает подпись', () => {
    const q = query();
    expect(verify({ ...q, id: '1' })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('подмена first_name ломает подпись', () => {
    const q = query();
    expect(verify({ ...q, first_name: 'Кто-то другой' })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('чужой токен бота — отказ', () => {
    expect(
      verify(query({}, TOKEN), '999:other-token-0000000000000000000'),
    ).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('секрет виджета отличается от секрета мини-приложения: подпись initData здесь не подходит', () => {
    // HMAC-SHA256(token, key="WebAppData") вместо SHA256(token) — секрет
    // мини-приложения. Даже с тем же токеном подпись не совпадёт.
    const values = fields();
    const dataCheckString = Object.keys(values)
      .sort()
      .map((key) => `${key}=${values[key as keyof typeof values]}`)
      .join('\n');
    const wrongSecret = createHmac('sha256', 'WebAppData')
      .update(TOKEN)
      .digest();
    const wrongHash = createHmac('sha256', wrongSecret)
      .update(dataCheckString)
      .digest('hex');
    expect(verify({ ...values, hash: wrongHash })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('просроченные (>24ч) данные — отказ', () => {
    expect(verify(query({ auth_date: String(NOW - 25 * 3600) }))).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('данные «из будущего» — отказ, небольшой сдвиг часов — нет', () => {
    expect(verify(query({ auth_date: String(NOW + 600) }))).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(verify(query({ auth_date: String(NOW + 30) })).ok).toBe(true);
  });

  it('без hash — отказ', () => {
    const { hash: _hash, ...rest } = query();
    expect(verify(rest)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('без id — отказ', () => {
    const { id: _id, ...rest } = query();
    expect(verify(rest)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('без бота не проверяем ничего', () => {
    expect(verify(query(), '')).toEqual({
      ok: false,
      reason: 'not-configured',
    });
    expect(
      verifyTelegramWidget({ query: query(), botToken: null, nowSec: NOW }),
    ).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('повтор ключа (массив вместо строки) — отказ, а не выбор одного значения', () => {
    const q = query();
    expect(verify({ ...q, id: [q.id, '1'] as unknown as string })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(
      verify({ ...q, hash: [q.hash, q.hash] as unknown as string }),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('слишком длинное обязательное поле — отказ до проверки подписи', () => {
    // Проверка длины срабатывает раньше сравнения подписи: даже если бы кто-то
    // честно подписал такой first_name, отказ должен быть «malformed», а не
    // «bad-signature» из-за расхождения строки для подписи.
    const q = query({ first_name: 'x'.repeat(1025) });
    expect(verify(q)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('нечисловой id — отказ', () => {
    const q = query();
    expect(verify({ ...q, id: 'not-a-number' })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('hash не hex-строка длины 64 — отказ', () => {
    const q = query();
    expect(verify({ ...q, hash: 'zz' })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('photo_url не по https — отбрасывается, но не портит вход', () => {
    const q = query({ photo_url: 'http://insecure.example/pic.jpg' });
    // http-фото не участвует в data-check-string, потому что мы всё равно
    // строим её из тех же значений, что подписал Telegram: подпись сойдётся,
    // а поле наружу не пройдёт.
    const result = verify(q);
    expect(result.ok).toBe(true);
    expect(result.ok && result.user.photoUrl).toBeUndefined();
  });

  it('необязательные поля (last_name, username, photo_url) могут отсутствовать', () => {
    const minimal = {
      id: '42',
      first_name: 'Нитай',
      auth_date: String(NOW - 5),
    };
    const q = sign(minimal);
    expect(verify(q)).toEqual({
      ok: true,
      authDate: NOW - 5,
      user: {
        id: 42,
        firstName: 'Нитай',
        lastName: undefined,
        username: undefined,
        photoUrl: undefined,
      },
    });
  });
});
