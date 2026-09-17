import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка данных запуска мини-приложения Telegram (`Telegram.WebApp.initData`).
 *
 * Подпись проверяется у себя, без обращения к Telegram
 * (core.telegram.org/bots/webapps, «Validating data received via the Mini
 * App»): строка — все поля, кроме `hash`, по алфавиту в виде `key=value`
 * через перевод строки; ключ — HMAC-SHA256 токена бота с ключом
 * `WebAppData`; подпись — hex HMAC-SHA256 строки этим ключом.
 */

export type TelegramUser = {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  photoUrl?: string;
};

export type TelegramInitDataResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | {
      ok: false;
      reason:
        | 'not-configured'
        | 'malformed'
        | 'bad-signature'
        | 'expired'
        | 'no-user';
    };

export type TelegramInitDataInput = {
  raw: unknown;
  botToken: string | null | undefined;
  nowSec: number;
  /** Сколько живут данные запуска. Telegram обновляет их при каждом открытии. */
  maxAgeSec?: number;
};

const MAX_LENGTH = 10_000;
const DEFAULT_MAX_AGE_SEC = 24 * 60 * 60;
/** Часы Telegram и сервера расходятся — небольшое «будущее» не отказ. */
const CLOCK_SKEW_SEC = 60;

function optionalString(value: unknown, max = 256): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    ? value
    : undefined;
}

function parseUser(json: string | undefined): TelegramUser | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  if (typeof u.id !== 'number' || !Number.isSafeInteger(u.id) || u.id <= 0) {
    return null;
  }
  if (u.is_bot === true) return null;
  const firstName = optionalString(u.first_name);
  if (!firstName) return null;
  const photoUrl = optionalString(u.photo_url, 1024);
  return {
    id: u.id,
    firstName,
    lastName: optionalString(u.last_name),
    username: optionalString(u.username, 64),
    languageCode: optionalString(u.language_code, 16),
    photoUrl: photoUrl?.startsWith('https://') ? photoUrl : undefined,
  };
}

export function verifyTelegramInitData(
  input: TelegramInitDataInput,
): TelegramInitDataResult {
  if (!input.botToken) return { ok: false, reason: 'not-configured' };
  const { raw } = input;
  if (typeof raw !== 'string' || !raw || raw.length > MAX_LENGTH) {
    return { ok: false, reason: 'malformed' };
  }

  const fields = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(raw)) {
    // Повтор поля — подделка: подпись считалась бы по одному значению,
    // а читали бы мы другое.
    if (fields.has(key)) return { ok: false, reason: 'malformed' };
    fields.set(key, value);
  }

  const hash = fields.get('hash');
  const authDateRaw = fields.get('auth_date');
  if (
    !hash ||
    !/^[0-9a-f]{64}$/.test(hash) ||
    !authDateRaw ||
    !/^\d{1,12}$/.test(authDateRaw)
  ) {
    return { ok: false, reason: 'malformed' };
  }

  const dataCheckString = [...fields.keys()]
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => `${key}=${fields.get(key)}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData')
    .update(input.botToken)
    .digest();
  const expected = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) {
    return { ok: false, reason: 'bad-signature' };
  }

  const authDate = Number(authDateRaw);
  const maxAge = input.maxAgeSec ?? DEFAULT_MAX_AGE_SEC;
  if (
    authDate > input.nowSec + CLOCK_SKEW_SEC ||
    input.nowSec - authDate > maxAge
  ) {
    return { ok: false, reason: 'expired' };
  }

  const user = parseUser(fields.get('user'));
  if (!user) return { ok: false, reason: 'no-user' };
  return { ok: true, user, authDate };
}
