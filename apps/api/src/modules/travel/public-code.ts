import { randomInt } from 'node:crypto';

/**
 * Публичный код объекта: адрес страницы с QR — `/travel/s/<code>`.
 *
 * Алфавит без похожих знаков (нет 0/O, 1/I/L): код печатают под QR и иногда
 * диктуют голосом, а «ноль или буква О» на стойке хостела — это чужой заезд.
 * Шесть знаков дают ~10^9 вариантов: перебором такой адрес не находят.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * Случайный код. `randomInt` из crypto, а не `Math.random()`: код — это весь
 * секрет публичной страницы, и предсказуемый генератор отдал бы её чужому.
 */
export function generatePublicCode(
  nextInt: (max: number) => number = (max) => randomInt(max),
): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[nextInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Привести код из адресной строки к каноническому виду или отказать.
 *
 * Строчные буквы поднимаются: ссылку набирают руками, и `travel/s/abc123`
 * обязан открыть ту же страницу. А вот замену O→0 не делаем: такого знака в
 * алфавите нет, и «исправленный» код увёл бы к чужому объекту.
 */
export function normalizePublicCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}
