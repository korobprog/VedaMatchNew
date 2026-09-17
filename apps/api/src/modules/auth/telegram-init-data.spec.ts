import { createHmac } from 'node:crypto';
import { verifyTelegramInitData } from './telegram-init-data';

const TOKEN = '123456:TEST-token_for-specs-only-000000000';
const NOW = 1_800_000_000;

const USER = {
  id: 777000111,
  first_name: 'Радха',
  last_name: 'Деви',
  username: 'radha_devi',
  language_code: 'ru',
  photo_url: 'https://t.me/i/userpic/320/radha.jpg',
};

/** Подпись по формуле документации — независимо от проверяемого кода. */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function fields(overrides: Record<string, string> = {}) {
  return {
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(USER),
    auth_date: String(NOW - 60),
    signature: 'c2lnbmF0dXJl',
    ...overrides,
  };
}

const verify = (raw: unknown, token = TOKEN, now = NOW) =>
  verifyTelegramInitData({ raw, botToken: token, nowSec: now });

describe('verifyTelegramInitData', () => {
  it('принимает подлинные данные и отдаёт пользователя', () => {
    const result = verify(sign(fields()));
    expect(result).toEqual({
      ok: true,
      authDate: NOW - 60,
      user: {
        id: 777000111,
        firstName: 'Радха',
        lastName: 'Деви',
        username: 'radha_devi',
        languageCode: 'ru',
        photoUrl: 'https://t.me/i/userpic/320/radha.jpg',
      },
    });
  });

  // signature — поле для проверки третьими лицами; в строку для подписи
  // ключом бота оно входит, исключается только hash.
  it('signature участвует в подписи', () => {
    const raw = sign(fields());
    const tampered = raw.replace('signature=c2lnbmF0dXJl', 'signature=b3RoZXI');
    expect(verify(tampered)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('порядок полей в строке не важен', () => {
    const raw = sign(fields());
    const shuffled = new URLSearchParams(
      [...new URLSearchParams(raw)].reverse(),
    ).toString();
    expect(verify(shuffled).ok).toBe(true);
  });

  it('подмена пользователя ломает подпись', () => {
    const raw = new URLSearchParams(sign(fields()));
    raw.set('user', JSON.stringify({ ...USER, id: 1 }));
    expect(verify(raw.toString())).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('чужой токен бота — отказ', () => {
    expect(
      verify(sign(fields(), '999:other-token-0000000000000000000')),
    ).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('без hash, user или auth_date — отказ', () => {
    const noHash = new URLSearchParams(sign(fields()));
    noHash.delete('hash');
    expect(verify(noHash.toString())).toEqual({
      ok: false,
      reason: 'malformed',
    });

    const { user: _user, ...withoutUser } = fields();
    expect(verify(sign(withoutUser))).toEqual({ ok: false, reason: 'no-user' });

    const { auth_date: _date, ...withoutDate } = fields();
    expect(verify(sign(withoutDate))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('просроченные и «из будущего» данные — отказ', () => {
    expect(
      verify(sign(fields({ auth_date: String(NOW - 25 * 3600) }))),
    ).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(verify(sign(fields({ auth_date: String(NOW + 600) })))).toEqual({
      ok: false,
      reason: 'expired',
    });
    // Небольшой сдвиг часов Telegram и сервера — не отказ.
    expect(verify(sign(fields({ auth_date: String(NOW + 30) }))).ok).toBe(true);
  });

  it('бот вместо человека — отказ', () => {
    const user = JSON.stringify({ ...USER, is_bot: true });
    expect(verify(sign(fields({ user })))).toEqual({
      ok: false,
      reason: 'no-user',
    });
  });

  it('битый user и пустой id — отказ', () => {
    expect(verify(sign(fields({ user: '{not json' })))).toEqual({
      ok: false,
      reason: 'no-user',
    });
    expect(
      verify(sign(fields({ user: JSON.stringify({ first_name: 'x' }) }))),
    ).toEqual({
      ok: false,
      reason: 'no-user',
    });
  });

  it('не строка, пусто или слишком длинно — отказ', () => {
    expect(verify(undefined)).toEqual({ ok: false, reason: 'malformed' });
    expect(verify('')).toEqual({ ok: false, reason: 'malformed' });
    expect(verify('x'.repeat(10_001))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('без токена бота ничего не принимает', () => {
    expect(verify(sign(fields()), '')).toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('allows_write_to_pm долетает булевым, а мусор в нём игнорируется', () => {
    const withPermission = JSON.stringify({
      ...USER,
      allows_write_to_pm: true,
    });
    const result = verify(sign(fields({ user: withPermission })));
    expect(result.ok && result.user.allowsWriteToPm).toBe(true);

    const withGarbage = JSON.stringify({
      ...USER,
      allows_write_to_pm: 'yes',
    });
    const garbageResult = verify(sign(fields({ user: withGarbage })));
    expect(garbageResult.ok && garbageResult.user.allowsWriteToPm).toBe(
      undefined,
    );
  });

  it('повтор поля — отказ, а не выбор одного из значений', () => {
    const raw = `${sign(fields())}&user=${encodeURIComponent(JSON.stringify({ ...USER, id: 1 }))}`;
    expect(verify(raw)).toEqual({ ok: false, reason: 'malformed' });
  });
});
