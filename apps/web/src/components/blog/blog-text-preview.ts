/**
 * Начало текста поста для свёрнутой карточки ленты (VED-371).
 *
 * Заказчик: «в развороте полный текст поста был скрыт и раскрывался
 * нажатием на достаточно крупную кнопку-надпись — Далее. На экране
 * смартфона в таком виде должно помещаться 3 поста». Значит свёрнутая
 * карточка обязана быть предсказуемой высоты, а не «сколько получилось».
 *
 * Обрезка считается здесь, а не в разметке `line-clamp`: карточке нужно
 * знать, есть ли что разворачивать. С `line-clamp` кнопка «Далее» висела бы
 * и под текстом, который целиком виден, — нажатие в пустоту. Тот же расчёт
 * идёт на сервере при SSR и в браузере, поэтому он чистый и без измерений
 * DOM.
 */

/**
 * Строк в свёрнутом виде. Три строки по 24px (`text-sm leading-6`) — это
 * 72px текста в карточке; вместе с шапкой, кнопкой «Далее» и ряда действий
 * карточка укладывается так, что на экране 375×812 их видно три.
 */
export const BLOG_PREVIEW_MAX_LINES = 3;

/**
 * Знаков в свёрнутом виде. Строка в карточке на 375px вмещает около 45
 * знаков, три — около 135; предел по знакам нужен для текста без переводов
 * строки, где «три строки» ничего не ограничивают. Берём с запасом на
 * широкий экран, где в строку влезает больше.
 */
export const BLOG_PREVIEW_MAX_CHARS = 220;

export interface BlogTextPreviewOptions {
  maxLines?: number;
  maxChars?: number;
}

export interface BlogTextPreview {
  /** Что показать в свёрнутой карточке. */
  text: string;
  /** Есть ли что разворачивать: `false` — кнопки «Далее» быть не должно. */
  truncated: boolean;
}

/** Обрезка заканчивается знаком конца мысли — многоточие к нему не нужно. */
const SENTENCE_END = /[.!?…]$/u;
/** Запятую и тире на обрыве убираем: «слово,…» читается как опечатка. */
const DANGLING = /[\s,;:—–-]+$/u;

/**
 * Начало текста и признак «есть продолжение».
 *
 * Текст сначала режется по строкам (абзацы в ленте живые), потом — по
 * знакам, если абзац оказался длинным. Обрыв ищется по границе слова, но
 * только в последней четверти отрезка: иначе одно длинное слово в начале
 * оставляло бы от превью два слога.
 */
export function buildBlogTextPreview(
  value: string,
  options: BlogTextPreviewOptions = {},
): BlogTextPreview {
  const maxLines = Math.max(1, Math.trunc(options.maxLines ?? BLOG_PREVIEW_MAX_LINES));
  const maxChars = Math.max(1, Math.trunc(options.maxChars ?? BLOG_PREVIEW_MAX_CHARS));
  const text = value.replace(/\r\n?/g, "\n");

  const lines = text.split("\n");
  let cut = lines.slice(0, maxLines).join("\n");
  // Отрезанный хвост из одних пробелов и переводов строк — не продолжение:
  // разворачивать там нечего, и кнопка «Далее» была бы обманом.
  let truncated = text.slice(cut.length).trim() !== "";

  if (cut.length > maxChars) {
    cut = cutToWord(cut, maxChars);
    truncated = true;
  }

  if (!truncated) return { text, truncated: false };

  const tail = cut.replace(DANGLING, "");
  return {
    text: SENTENCE_END.test(tail) ? tail : `${tail}…`,
    truncated: true,
  };
}

function cutToWord(value: string, maxChars: number): string {
  const hard = value.slice(0, maxChars);
  const space = hard.search(/\s+\S*$/u);
  // Граница слова годится, если она не съедает больше четверти отрезка.
  return space > maxChars * 0.75 ? hard.slice(0, space) : hard;
}
