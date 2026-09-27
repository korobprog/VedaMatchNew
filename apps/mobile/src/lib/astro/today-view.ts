import { GRAHA_NAMES, NAKSHATRA_NAMES, RASHI_NAMES, type AstroTodayDto } from '@vedamatch/shared';
import { errorText } from '@/lib/api/error-text';

/**
 * «Персональный день» в приложении: что показать на экране
 * (`app/astro/today.tsx`) и какими словами.
 *
 * Модуль чистый — ни `react-native`, ни сети: экран передаёт сюда исход
 * запроса, а получает состояние и готовые строки. Так состояния и
 * формулировки проверяются тестом, а не только на телефоне.
 *
 * Что и как говорится — вслед за карточкой сайта
 * (`apps/web/src/components/astro/today-card.tsx`): факты транзитной Луны и
 * текущий период даши есть всегда, текста дня может не быть. Платного здесь
 * нет ничего: факты считаются бесплатно, а фраза общая на весь портал по
 * бхаве Луны (`astro-transit.service.ts`) — ни цены, ни призыва оплатить
 * экрану показывать нечего ни в одном канале.
 */

/** Раздел сайта с формой данных рождения. */
export const ASTRO_BIRTH_DATA_PATH = '/astro';
/** Карта рождения на сайте — туда вело уведомление до этого экрана. */
export const ASTRO_CHART_PATH = '/astro/chart';

export const TODAY_TITLE = 'Персональный день';

export const TODAY_LOAD_ERROR = 'Не удалось загрузить персональный день.';

/**
 * Сессия приложения в браузер не переносится (`lib/web-portal.ts`), поэтому
 * говорим заранее у каждой ссылки на сайт: иначе человек увидит лендинг и
 * решит, что его выкинуло из аккаунта.
 */
export const SITE_LOGIN_NOTE = 'Сайт откроется в браузере — там нужно войти тем же аккаунтом.';

/**
 * Нет данных рождения или неизвестно время: сервер не отличает эти случаи
 * (оба — 404), и экрану отличать незачем — лечатся они одним и тем же.
 */
export const NEEDS_BIRTH_DATA = {
  title: 'Нужны данные рождения',
  body:
    'Персональный день считается по вашей карте рождения: для неё нужны дата, ' +
    'точное время и место рождения. Заполните их в разделе «Астрология» на ' +
    'сайте — и день появится здесь.',
  action: 'Заполнить на сайте',
  recheck: 'Проверить снова',
} as const;

export const CHART_LINK_LABEL = 'Карта рождения на сайте';

/**
 * Та же оговорка, что под формой на сайте (`app/(portal)/astro/page.tsx`):
 * текст дня — не совет врача, юриста или финансиста.
 */
export const TODAY_DISCLAIMER =
  'Материалы сервиса — для самопознания и размышления, они не заменяют ' +
  'медицинскую, юридическую или финансовую консультацию.';

export type TodayState =
  | { kind: 'loading' }
  | { kind: 'ready'; today: AstroTodayDto }
  | { kind: 'needs-birth-data' }
  | { kind: 'error'; message: string };

export type TodayOutcome =
  | { kind: 'loaded'; today: AstroTodayDto | null }
  | { kind: 'failed'; error: unknown };

/** Состояние экрана по исходу запроса. */
export function todayStateOf(outcome: TodayOutcome): TodayState {
  if (outcome.kind === 'failed') {
    return { kind: 'error', message: errorText(outcome.error, TODAY_LOAD_ERROR) };
  }
  return outcome.today ? { kind: 'ready', today: outcome.today } : { kind: 'needs-birth-data' };
}

/** Имя по номеру 1..N; вне диапазона — `null`, а не `undefined` в тексте. */
function nameAt(names: readonly string[], index: number): string | null {
  return Number.isInteger(index) && index >= 1 && index <= names.length ? names[index - 1] : null;
}

function validBhava(bhava: number): boolean {
  return Number.isInteger(bhava) && bhava >= 1 && bhava <= 12;
}

export interface TodayFact {
  label: string;
  value: string;
}

export interface TodayView {
  /** Текст дня или честная замена ему. */
  text: string;
  /** Текста дня ещё нет — показана замена, её красят вторичным цветом. */
  pending: boolean;
  facts: TodayFact[];
}

/**
 * Что написать на карточке дня.
 *
 * Без текста — факты словами и «появится чуть позже», как на сайте: фраза
 * генерируется по мере того, как за день появляются новые бхавы, и при
 * недоступном ИИ её может не быть. Пустая карточка выглядела бы поломкой.
 *
 * Номер вне таблицы (сервер новее приложения, битый ответ) не превращается
 * в «undefined»: такой факт просто не показывается.
 */
export function describeToday(today: AstroTodayDto): TodayView {
  const rashi = nameAt(RASHI_NAMES, today.moonRashi);
  const nakshatra = nameAt(NAKSHATRA_NAMES, today.moonNakshatra);
  const bhava = validBhava(today.moonBhava) ? today.moonBhava : null;

  const moonParts = [rashi, nakshatra, bhava ? `${bhava}-я бхава` : null].filter(
    (part): part is string => part !== null,
  );
  const facts: TodayFact[] = [];
  if (moonParts.length > 0) facts.push({ label: 'Луна', value: moonParts.join(', ') });

  const maha = GRAHA_NAMES[today.currentMahadasha?.lord];
  const antar = GRAHA_NAMES[today.currentAntardasha?.lord];
  if (maha && antar) facts.push({ label: 'Период', value: `${maha} — ${antar}` });

  const text = today.text?.trim();
  if (text) return { text, pending: false, facts };

  const where = [rashi ? `в знаке ${rashi}` : null, bhava ? `в ${bhava}-й бхаве` : null]
    .filter((part): part is string => part !== null)
    .join(', ');
  const fallback = where
    ? `Луна сегодня ${where}. Разбор дня появится чуть позже.`
    : 'Разбор дня появится чуть позже.';
  return { text: fallback, pending: true, facts };
}
