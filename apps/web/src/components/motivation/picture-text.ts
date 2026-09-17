import { LONG_IMAGE_QUOTE_CHARS, isLongQuote } from "./quote-text";

/**
 * Текст поверх картинки и текст в окне «Читать полностью» (VED-241).
 *
 * Раньше это была одна строка — цитата из `text`, — и поправить надпись на
 * картинке, не тронув полный текст, было нельзя: длинная шлока на кадре
 * обрезалась, а сократить её значило сократить и окно, где её дочитывают.
 * Теперь у редакции отдельное поле `imageText`; пустое — картинка, как и
 * прежде, показывает цитату.
 */
export function pictureTextOf(
  imageText: string | null | undefined,
  quote: string,
): string {
  return imageText?.trim() || quote;
}

/**
 * Нужна ли под картинкой кнопка «Читать полностью».
 *
 * Прежние поводы остались: цитата длиннее границы или обрезана замером. Новый
 * — надпись на картинке отличается от полного текста: иначе поправленную
 * отдельно, короткую надпись никто бы не раскрыл, и полный текст пропал бы из
 * ленты совсем.
 */
export function needsFullQuote({
  pictureText,
  quote,
  clamped,
}: {
  pictureText: string;
  quote: string;
  clamped: boolean;
}): boolean {
  if (!quote.trim()) return false;
  if (pictureText.trim() !== quote.trim()) return true;
  return clamped || isLongQuote(pictureText, LONG_IMAGE_QUOTE_CHARS);
}
