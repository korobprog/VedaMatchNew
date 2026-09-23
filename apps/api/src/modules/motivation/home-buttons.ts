import { MAX_ATTRIBUTION_FILTER_LENGTH } from './feed-attribution';

/**
 * Две кнопки «Вдохновения» на главной (VED-401): «лента источника» и
 * «открытки папки». Участник меняет их в настройках ленты; здесь — разбор
 * того, что пришло в PATCH `/motivation/preferences`.
 *
 * Три значения у каждого поля, и все три нужны:
 * - `undefined` — поле не прислали, настройка не меняется (форма языка и
 *   направлений шлёт свои поля без этих);
 * - `null` — «по умолчанию»: пустая строка значит то же самое, так проще
 *   форме с пунктом «По умолчанию» в выпадающем списке;
 * - строка — выбор участника.
 *
 * Умолчание в базу не пишется: колонка пустая, а что это Гита и «Мудрость
 * мира», решает клиент. Смена умолчания тогда не требует бэкфила.
 */
export type HomeButtonField = string | null | undefined;

/**
 * Форма слага папки. Нынешние слаги — латиница, цифры и дефис
 * (`category-slug.ts`), но папки, заведённые раньше, могли получить слаг
 * иначе, поэтому правило широкое: оно отсекает мусор, а есть ли такая
 * папка — решает база.
 */
const SLUG = /^[A-Za-z0-9_-]+$/;
export const MAX_HOME_CATEGORY_SLUG_LENGTH = 120;

export class InvalidHomeButtonError extends Error {}

/** Источник кнопки «Лента»: строка из списка фильтра ленты. */
export function parseHomeSourceWork(value: unknown): HomeButtonField {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidHomeButtonError();
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length > MAX_ATTRIBUTION_FILTER_LENGTH)
    throw new InvalidHomeButtonError();
  return text;
}

/**
 * Папка кнопки «Открытки». Здесь — только форма слага; что такая папка
 * есть, сервис проверяет по базе.
 */
export function parseHomeCategorySlug(value: unknown): HomeButtonField {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidHomeButtonError();
  const slug = value.trim();
  if (!slug) return null;
  if (slug.length > MAX_HOME_CATEGORY_SLUG_LENGTH || !SLUG.test(slug))
    throw new InvalidHomeButtonError();
  return slug;
}
