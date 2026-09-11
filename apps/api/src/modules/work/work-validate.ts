import { BadRequestException } from '@nestjs/common';
import {
  WORK_COLORS,
  WORK_SPACE_NAME_MAX,
  type WorkColor,
  type WorkTaskPriority,
} from '@vedamatch/shared';

// Карта транслитерации скопирована из music/music-slug.ts: контракт сервисного
// модуля запрещает импортировать хелперы другого сервиса.
const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function translit(text: string): string {
  return Array.from(text.toLowerCase())
    .map((letter) => TRANSLIT[letter] ?? letter)
    .join('');
}

/** Границы префикса: VM читается, V — нет, VEDAMATCHPROJECT не помещается. */
const PREFIX_MIN = 2;
const PREFIX_MAX = 5;
/** Из одного слова берём столько букв: «Прииск» → PRI. */
const PREFIX_SINGLE_WORD = 3;
const PREFIX_FALLBACK = 'WRK';

/**
 * Префикс номеров задач по названию среды: «Veda Match» → `VM`, «Прииск» →
 * `PRI`. Номер вида `VM-14` нужен, чтобы про задачу можно было написать
 * словами в чате, а не ссылкой на uuid.
 *
 * Из нескольких слов берутся первые буквы, из одного — первые три. Уникальность
 * здесь не проверяется: две среды с префиксом `VM` — не беда, номер уникален
 * внутри своей среды, а ссылка всё равно ведёт в конкретную.
 */
export function workPrefixFromName(name: string): string {
  const words = translit(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) return PREFIX_FALLBACK;

  const initials =
    words.length > 1
      ? words
          .slice(0, PREFIX_MAX)
          .map((word) => word[0])
          .join('')
      : words[0].slice(0, PREFIX_SINGLE_WORD);

  const prefix = initials.toUpperCase().slice(0, PREFIX_MAX);
  return prefix.length >= PREFIX_MIN ? prefix : PREFIX_FALLBACK;
}

/** Номер задачи, каким его видят люди. */
export function workTaskKey(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

/**
 * Обязательная строка: обрезает пробелы и проверяет длину. Пустое имя среды
 * или задачи — не «значение по умолчанию», а потерянная карточка в списке.
 */
export function requireText(
  value: unknown,
  field: string,
  max: number,
): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`${field}: нужно заполнить`);
  if (text.length > max) {
    throw new BadRequestException(`${field}: не длиннее ${max} знаков`);
  }
  return text;
}

/** Необязательная строка: пустая означает «стереть», а не «не трогать». */
export function optionalText(
  value: unknown,
  field: string,
  max: number,
): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > max) {
    throw new BadRequestException(`${field}: не длиннее ${max} знаков`);
  }
  return text;
}

export function normalizeWorkColor(value: unknown): WorkColor {
  const color = typeof value === 'string' ? value.trim() : '';
  return (WORK_COLORS as readonly string[]).includes(color)
    ? (color as WorkColor)
    : WORK_COLORS[0];
}

const PRIORITIES: WorkTaskPriority[] = ['low', 'normal', 'high', 'urgent'];

export function normalizeWorkPriority(value: unknown): WorkTaskPriority {
  return PRIORITIES.includes(value as WorkTaskPriority)
    ? (value as WorkTaskPriority)
    : 'normal';
}

/**
 * Срок задачи. `null` и пустая строка означают «убрать срок»; мусор — ошибку,
 * а не молчаливое «без срока»: молча потерянный срок хуже отказа.
 */
export function parseWorkDueAt(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('Срок: нужна дата');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Срок: непонятная дата');
  }
  return date;
}

/** Имя среды с проверкой длины — вынесено, потому что зовётся из двух мест. */
export function requireSpaceName(value: unknown): string {
  return requireText(value, 'Название среды', WORK_SPACE_NAME_MAX);
}

/**
 * WIP-лимит колонки: 0 — без предела. Отрицательное и дробное — ошибка ввода,
 * а не повод угадывать.
 */
export function normalizeWipLimit(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 999) {
    throw new BadRequestException('Лимит раздела: целое число от 0 до 999');
  }
  return limit;
}
