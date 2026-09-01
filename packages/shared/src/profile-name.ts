/**
 * Проверка имени в профиле. Живёт в общем пакете, потому что нужна дважды и
 * ответы обязаны совпадать: сервер отказывает в мусоре, а форма на вебе
 * показывает то же самое ещё до отправки.
 *
 * Уровня два, и они разные по смыслу:
 * - `findNameError` — жёсткий отказ. Только то, что именем быть не может:
 *   пустота, цифры, ссылки, эмодзи. Сюда нельзя добавлять «подозрительное»:
 *   отказ ловит и редкое настоящее имя, а человеку некуда идти.
 * - `collectNameWarnings` — подсказки. Написание выглядит странно, но это
 *   может быть правдой, поэтому сохранить можно: решает человек, не портал.
 */

import { NAME_MAX_LENGTH } from './index';

/** Короче двух букв имя не бывает, а «А» в анкете — это отказ отвечать. */
export const NAME_MIN_LENGTH = 2;

/**
 * Разрешённые символы: буквы любого алфавита, пробел, дефис, апостроф и
 * точка (сокращения вроде «Б. К.»). Цифры, эмодзи и знаки препинания
 * остального набора отсекаются — с ними это не имя.
 */
const ALLOWED_NAME_CHARS = /^[\p{L}\p{M}\s'’.\-]+$/u;
const HAS_LETTER = /\p{L}/u;
const LOOKS_LIKE_LINK = /(https?:\/\/|www\.|\S+@\S+\.\S+|t\.me\/|@[A-Za-z0-9_]{3,})/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const VOWELS = /[аеёиоуыэюяaeiouyАЕЁИОУЫЭЮЯAEIOUY]/u;
const REPEATED_LETTER = /(\p{L})\1{2,}/u;
const LOWERCASE_LETTER = /\p{Ll}/u;
const UPPERCASE_LETTER = /\p{Lu}/u;

/** Слов больше этого — уже фраза или адрес, а не имя. */
const MAX_NAME_WORDS = 4;

/**
 * Причина отказа или `null`, если имя принимается. `label` подставляется в
 * текст («Имя», «Духовное имя»), чтобы одна проверка обслуживала оба поля.
 */
export function findNameError(
  value: string,
  label = 'Имя',
): string | null {
  const name = value.trim();
  if (!name) return `${label} не может быть пустым`;
  if (name.length > NAME_MAX_LENGTH) {
    return `${label} не длиннее ${NAME_MAX_LENGTH} символов`;
  }
  if (LOOKS_LIKE_LINK.test(name)) {
    return `${label} — это имя, а не ссылка или контакт`;
  }
  if (!ALLOWED_NAME_CHARS.test(name)) {
    return `${label} состоит из букв, пробелов и дефисов — без цифр и символов`;
  }
  if (!HAS_LETTER.test(name)) return `${label} должно содержать буквы`;
  if (letterCount(name) < NAME_MIN_LENGTH) {
    return `${label} не короче ${NAME_MIN_LENGTH} букв`;
  }
  return null;
}

/**
 * Подсказки о странном написании. Пустой массив — вопросов нет. Порядок
 * фиксированный: сначала то, что заметнее человеку.
 */
export function collectNameWarnings(value: string): string[] {
  const name = value.trim();
  if (!name || findNameError(name)) return [];

  const warnings: string[] = [];
  const words = name.split(/\s+/);

  // Про регистр спрашиваем только у алфавитов, где он есть: в деванагари или
  // китайском заглавных букв не бывает, и обе подсказки были бы ложными.
  if (
    letterCount(name) >= 4 &&
    UPPERCASE_LETTER.test(name) &&
    !LOWERCASE_LETTER.test(name)
  ) {
    warnings.push('Имя набрано заглавными буквами — обычно пишут как в паспорте.');
  }
  if (LOWERCASE_LETTER.test(name) && !UPPERCASE_LETTER.test(name)) {
    warnings.push('Имя обычно пишут с заглавной буквы.');
  }
  if (words.length > MAX_NAME_WORDS) {
    warnings.push('Похоже на фразу, а не на имя — здесь ждут только имя.');
  }
  if (words.some((word) => CYRILLIC.test(word) && LATIN.test(word))) {
    warnings.push(
      'В одном слове смешаны кириллица и латиница — так получается случайно.',
    );
  }
  if (REPEATED_LETTER.test(name)) {
    warnings.push('Буква повторяется три раза подряд — возможно, опечатка.');
  }
  if (
    words.some((word) => letterCount(word) >= 3 && !VOWELS.test(word))
  ) {
    warnings.push('В слове нет гласных — похоже на набор символов.');
  }

  return warnings;
}

function letterCount(value: string): number {
  return Array.from(value).filter((char) => HAS_LETTER.test(char)).length;
}
