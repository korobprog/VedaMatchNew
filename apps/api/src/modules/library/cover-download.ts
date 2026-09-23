import { contentDisposition } from './book-files';

/** Имя файла без расширения — не длиннее, чтобы не упереться в лимит ФС. */
const MAX_COVER_STEM = 100;

/**
 * Имя, под которым картинка материала сохранится у читателя (VED-138).
 *
 * Берём заголовок: «Нрисимха-чатурдаши.webp» в загрузках телефона понятнее,
 * чем ключ из бакета. Из заголовка убираем то, что файловые системы не
 * принимают или понимают по-своему: разделители пути, двоеточие, кавычки,
 * управляющие символы. Точки внутри оставляем — «БГ. 9.10» остаётся собой,
 * а расширение всё равно берётся из ключа, то есть по настоящему формату.
 */
export function coverFileName(
  title: string | null | undefined,
  key: string,
): string {
  const extension = /\.([A-Za-z0-9]{1,5})$/.exec(key)?.[1]?.toLowerCase();
  const cleaned = Array.from(title ?? '')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || code === 127) return ' ';
      return /[\\/:*?"<>|]/.test(ch) ? ' ' : ch;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    // Точка в конце имени — не расширение, а мусор, и Windows её срезает.
    .replace(/[.\s]+$/, '');
  const stem = Array.from(cleaned).slice(0, MAX_COVER_STEM).join('').trim();
  return `${stem || 'cover'}.${extension ?? 'webp'}`;
}

/** Заголовок для подписанной ссылки: всегда файлом, а не показом в браузере. */
export function coverDisposition(
  title: string | null | undefined,
  key: string,
): string {
  return contentDisposition('attachment', coverFileName(title, key));
}
