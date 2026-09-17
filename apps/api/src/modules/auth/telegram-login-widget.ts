import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка данных виджета «Telegram Login Widget»
 * (core.telegram.org/widgets/login) — вход на самом сайте, кнопкой, БЕЗ
 * мини-приложения. Отличать от `telegram-init-data.ts`: там проверяются
 * `Telegram.WebApp.initData` мини-приложения.
 *
 * Формула подписи документации виджета: data-check-string — все поля,
 * которые прислал Telegram (`auth_date`, `first_name`, `id`, `last_name`,
 * `photo_url`, `username`), КРОМЕ `hash`, отсортированные по алфавиту,
 * `key=value` через перевод строки; секрет — SHA256(bot_token) (БЕЗ
 * HMAC и БЕЗ ключа `WebAppData` — это ключевое отличие от мини-приложения,
 * где секрет — HMAC-SHA256(bot_token, key="WebAppData")); подпись —
 * hex HMAC-SHA256 строки этим секретом.
 *
 * На вход приходит `req.query` целиком: помимо полей виджета там могут быть
 * посторонние параметры (`returnTo`, `returnOrigin`), которые мы сами
 * дописали в `data-auth-url`. Telegram их не подписывает, поэтому в
 * data-check-string идут строго ИЗВЕСТНЫЕ поля виджета — посторонние ключи
 * молча игнорируются, а не портят подпись.
 */

export type TelegramWidgetUser = {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

export type TelegramWidgetResult =
  | { ok: true; user: TelegramWidgetUser; authDate: number }
  | {
      ok: false;
      reason: 'not-configured' | 'malformed' | 'bad-signature' | 'expired';
    };

export type TelegramWidgetInput = {
  /** `req.query` — включая посторонние параметры, не относящиеся к виджету. */
  query: Record<string, unknown>;
  botToken: string | null | undefined;
  nowSec: number;
  /** Сколько живёт переход из виджета (человек может держать вкладку открытой). */
  maxAgeSec?: number;
};

const DEFAULT_MAX_AGE_SEC = 24 * 60 * 60;
/** Часы Telegram и сервера расходятся — небольшое «будущее» не отказ. */
const CLOCK_SKEW_SEC = 60;
const MAX_FIELD_LENGTH = 1024;

/** Поля, которые Telegram подписывает (без `hash`). Порядок здесь не важен —
 *  data-check-string всё равно сортируется по алфавиту. */
const SIGNED_FIELDS = [
  'auth_date',
  'first_name',
  'id',
  'last_name',
  'photo_url',
  'username',
] as const;

/** Ровно одно строковое значение — не массив (повтор ключа в query) и не
 *  пусто/слишком длинно. Массив означает повтор параметра: express/qs
 *  превращает `?id=1&id=2` в `['1','2']`, и подпись, посчитанная по одному
 *  значению, не должна совпасть с тем, что мы прочитали бы из другого. */
function singleString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > MAX_FIELD_LENGTH) return undefined;
  return value;
}

export function verifyTelegramWidget(
  input: TelegramWidgetInput,
): TelegramWidgetResult {
  if (!input.botToken) return { ok: false, reason: 'not-configured' };
  const { query } = input;

  const hash = singleString(query.hash);
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
    return { ok: false, reason: 'malformed' };
  }

  const idRaw = singleString(query.id);
  const authDateRaw = singleString(query.auth_date);
  const firstName = singleString(query.first_name);
  if (!idRaw || !/^\d{1,20}$/.test(idRaw)) {
    return { ok: false, reason: 'malformed' };
  }
  if (!authDateRaw || !/^\d{1,12}$/.test(authDateRaw)) {
    return { ok: false, reason: 'malformed' };
  }
  if (!firstName) return { ok: false, reason: 'malformed' };

  const id = Number(idRaw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, reason: 'malformed' };
  }

  const lastName = singleString(query.last_name);
  const username = singleString(query.username);
  const photoUrlRaw = singleString(query.photo_url);

  // Только известные поля виджета попадают в строку для подписи — что бы ни
  // приехало сверх них (`returnTo`, служебный мусор), Telegram это не
  // подписывал, и учитывать их в проверке нельзя.
  const fieldValues: Partial<Record<(typeof SIGNED_FIELDS)[number], string>> = {
    id: idRaw,
    first_name: firstName,
    auth_date: authDateRaw,
  };
  if (lastName !== undefined) fieldValues.last_name = lastName;
  if (username !== undefined) fieldValues.username = username;
  if (photoUrlRaw !== undefined) fieldValues.photo_url = photoUrlRaw;

  const dataCheckString = SIGNED_FIELDS.filter((key) => key in fieldValues)
    .slice()
    .sort()
    .map((key) => `${key}=${fieldValues[key]}`)
    .join('\n');

  // Секрет виджета — просто SHA256(bot_token), БЕЗ ключа "WebAppData": в этом
  // разница с мини-приложением (`telegram-init-data.ts`). Перепутать секреты
  // легко и подпись при этом не совпадёт ни в одну, ни в другую сторону.
  const secret = createHash('sha256').update(input.botToken).digest();
  const expectedHex = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
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

  const photoUrl = photoUrlRaw?.startsWith('https://')
    ? photoUrlRaw
    : undefined;

  return {
    ok: true,
    authDate,
    user: { id, firstName, lastName, username, photoUrl },
  };
}
