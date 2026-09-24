import { APP_DOWNLOAD_PATH } from './app-release';
import type { PushPayload } from './fcm';

/**
 * Пуш «Доступна новая версия — обновите» телефонам со сборкой с сайта.
 * Чистый модуль: кому, когда и каким текстом. Отправку ведёт
 * `app-release-worker.service.ts`.
 *
 * Правила:
 * - только сборка с сайта (`*-site`): магазинную обновляет магазин, и
 *   призыв ставить APK мимо него там запрещён правилами Google;
 * - только отставшим: версия телефона меньше вышедшей. Версия неизвестна
 *   (`null`) — это сборка старше поля `appVersionCode`, то есть заведомо
 *   старше любого выпуска, объявленного после него;
 * - один пуш на выпуск: `updatePromptedCode` помнит, о каком уже звали;
 * - категория «Новости портала» (`announcements`): выключил её человек или
 *   все уведомления — не зовём;
 * - не ночью: с 9 до 21 по часовому поясу человека (`User.timeZone`, без
 *   него — по Москве), как утреннее окно персонального дня в astro.
 *   Ночной телефон просто дождётся утра — пометки о пуше у него ещё нет.
 */

/** Окно пушей по местному времени: [с, до). */
export const PROMPT_HOUR_FROM = 9;
export const PROMPT_HOUR_TO = 21;
/** Москва круглый год UTC+3: перевода часов в России нет с 2014-го. */
export const DEFAULT_TIME_ZONE = 'Europe/Moscow';

export type PromptCandidate = {
  appVariant: string | null;
  appVersionCode: number | null;
  updatePromptedCode: number | null;
  timeZone: string | null;
  /** Строки настроек может не быть — это «включено всё». */
  preference: { enabled: boolean; announcements: boolean } | null;
};

export type PromptDecision =
  /** Слать сейчас. */
  | 'push'
  /** Не слать и отметить: для этого выпуска вопрос закрыт. */
  | 'skip'
  /** Не слать и не отмечать: ночь, дождётся окна. */
  | 'wait'
  /** Телефону напоминать не о чем. */
  | 'none';

export function isSiteVariant(variant: string | null): boolean {
  return typeof variant === 'string' && variant.endsWith('-site');
}

export function updatePromptDecision(
  device: PromptCandidate,
  release: { variant: string; versionCode: number },
  now: Date,
): PromptDecision {
  if (
    !isSiteVariant(device.appVariant) ||
    device.appVariant !== release.variant
  )
    return 'none';
  if (
    device.appVersionCode !== null &&
    device.appVersionCode >= release.versionCode
  )
    return 'none';
  if (
    device.updatePromptedCode !== null &&
    device.updatePromptedCode >= release.versionCode
  )
    return 'none';
  const preference = device.preference;
  if (preference && (!preference.enabled || !preference.announcements))
    return 'skip';
  return isPromptHour(now, device.timeZone) ? 'push' : 'wait';
}

/** Попадает ли момент в дневное окно по местному времени человека. */
export function isPromptHour(now: Date, timeZone: string | null): boolean {
  const hour = localHour(now, timeZone);
  return hour >= PROMPT_HOUR_FROM && hour < PROMPT_HOUR_TO;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/**
 * Местный час 0..23. Копия из astro (`transit-schedule.ts`): модули не
 * импортируют друг друга. Незнакомая зона — по Москве, а не падение.
 */
export function localHour(now: Date, timeZone: string | null): number {
  const formatter =
    (timeZone ? formatterFor(timeZone) : null) ??
    formatterFor(DEFAULT_TIME_ZONE)!;
  const part = formatter.formatToParts(now).find((p) => p.type === 'hour');
  return Number(part?.value ?? 0) % 24;
}

/**
 * Текст пуша. Путь `/app` приложение открывает разделом «Сервисы», где
 * самообновление («Проверить обновление») само находит новую версию; на
 * сайте это страница загрузки. Тег один на выпуск: повтор заменил бы
 * прежнее уведомление, а не лёг вторым.
 */
export function updatePromptPayload(release: {
  variant: string;
  versionCode: number;
  versionName: string;
}): PushPayload {
  const base = release.versionName.split('+')[0].trim();
  const version = base
    ? `${base} (сборка ${release.versionCode})`
    : `сборка ${release.versionCode}`;
  return {
    title: 'Доступна новая версия VedaMatch',
    body: `Вышла версия ${version}. Обновите приложение — это займёт минуту.`,
    url: APP_DOWNLOAD_PATH,
    tag: `app-update-${release.variant}-${release.versionCode}`,
  };
}
