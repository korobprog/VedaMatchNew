/**
 * Подписи и обрезка текста в карточке блог-ленты (VED-334).
 *
 * Правила — те же, что у сайта (`apps/web/src/components/blog/blog-format.ts`,
 * `blog-text-preview.ts`): дата человеческим языком, отметка о правке и
 * свёрнутый текст с «Далее» (VED-371). Импортировать их из веба нельзя —
 * приложение собирается отдельно, — поэтому здесь копия, а расхождение с
 * сайтом ловят тесты рядом: одинаковые входы, одинаковые строки.
 */

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Дата поста. Год — только у прошлогодних: в ленте, где почти всё свежее,
 * «2026» рядом с каждым постом — шум. Пустая строка на битой дате: лучше
 * промолчать, чем показать «NaN undefined».
 */
export function blogPostDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  if (date.getFullYear() !== now.getFullYear()) {
    return `${day} ${month} ${date.getFullYear()}`;
  }
  return `${day} ${month}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Отметка о правке (VED-321). В день публикации хватает часов, в другой
 * день — день и месяц. `null` — пост не правили, подписи нет.
 */
export function blogEditedLabel(editedAt: string | null, createdAt: string): string | null {
  if (!editedAt) return null;
  const edited = new Date(editedAt);
  if (Number.isNaN(edited.getTime())) return null;
  const created = new Date(createdAt);
  const sameDay =
    !Number.isNaN(created.getTime()) &&
    created.getFullYear() === edited.getFullYear() &&
    created.getMonth() === edited.getMonth() &&
    created.getDate() === edited.getDate();
  if (sameDay) return `изменено в ${pad(edited.getHours())}:${pad(edited.getMinutes())}`;
  return `изменено ${edited.getDate()} ${MONTHS[edited.getMonth()]}`;
}

/** Строк в свёрнутой карточке — как на сайте (VED-371). */
export const BLOG_PREVIEW_MAX_LINES = 3;
/** Знаков в свёрнутой карточке: предел для текста без переводов строки. */
export const BLOG_PREVIEW_MAX_CHARS = 120;

export interface BlogTextPreview {
  /** Что показать в свёрнутой карточке. */
  text: string;
  /** Есть ли что разворачивать: `false` — кнопки «Далее» быть не должно. */
  truncated: boolean;
}

const SENTENCE_END = /[.!?…]$/u;
const DANGLING = /[\s,;:—–-]+$/u;

function cutToWord(value: string, maxChars: number): string {
  const hard = value.slice(0, maxChars);
  const space = hard.search(/\s+\S*$/u);
  // Граница слова годится, только если она не съедает больше четверти
  // отрезка: иначе одно длинное слово оставило бы от превью два слога.
  return space > maxChars * 0.75 ? hard.slice(0, space) : hard;
}

/**
 * Начало текста и признак «есть продолжение». Сначала — по строкам (абзацы
 * живые), потом — по знакам. Считается заранее, а не по замеру `onTextLayout`:
 * кнопка «Далее» под текстом, который виден целиком, — нажатие в пустоту.
 */
export function buildBlogTextPreview(
  value: string,
  maxLines: number = BLOG_PREVIEW_MAX_LINES,
  maxChars: number = BLOG_PREVIEW_MAX_CHARS,
): BlogTextPreview {
  const text = value.replace(/\r\n?/g, '\n');
  let cut = text.split('\n').slice(0, maxLines).join('\n');
  // Хвост из одних пробелов — не продолжение, разворачивать там нечего.
  let truncated = text.slice(cut.length).trim() !== '';
  if (cut.length > maxChars) {
    cut = cutToWord(cut, maxChars);
    truncated = true;
  }
  if (!truncated) return { text, truncated: false };
  const tail = cut.replace(DANGLING, '');
  return { text: SENTENCE_END.test(tail) ? tail : `${tail}…`, truncated: true };
}
