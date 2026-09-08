/**
 * Пояснение хранится в `post.text` склеенным с цитатой через пустую строку
 * (см. `motivation-copy.service.ts`). И админская карточка, и лента показывают
 * цитату всегда, а пояснение — отдельным сворачиваемым блоком.
 */
export function splitQuoteAndExplanation(text: string): {
  quote: string;
  explanation: string;
} {
  const separator = text.indexOf("\n\n");
  if (separator === -1) return { quote: text.trim(), explanation: "" };
  return {
    quote: text.slice(0, separator).trim(),
    explanation: text.slice(separator + 2).trim(),
  };
}

/**
 * Обратное разбору склеивание — тем же разделителем, что пишет сервер.
 * Пустое пояснение не оставляет за собой висячей пустой строки: иначе разбор
 * вернул бы пояснением пустоту, а карточка показала бы пустой блок
 * «Пояснение».
 */
export function joinQuoteAndExplanation(
  quote: string,
  explanation: string,
): string {
  const head = quote.trim();
  const tail = explanation.trim();
  return tail ? `${head}\n\n${tail}` : head;
}

/**
 * Примерная граница в символах для ролика: его подпись вшита в кадр воркером,
 * своей копии в DOM нет, и замерить обрезку неоткуда — остаётся прикидка.
 * Ошибается она в безопасную сторону: воркер режет подпись на двенадцатой
 * строке кадра (см. MAX_QUOTE_LINES в story-image.ts), а это заметно больше
 * ста семидесяти знаков, так что кнопка появляется раньше, чем текст теряется.
 *
 * Фото так считать нельзя: там цитата лежит в DOM под `line-clamp-4`, четыре
 * строки кончаются примерно на ста сорока знаках, и шлоки между этими двумя
 * числами обрезались молча — конец не виден, а кнопки нет. Их случай решает
 * isTextClamped замером, а не счётом.
 */
const LONG_QUOTE_CHARS = 170;

export function isLongQuote(text: string): boolean {
  return text.trim().length > LONG_QUOTE_CHARS;
}

/**
 * Запас на дробные пиксели. Высота строки почти никогда не целая, браузер
 * округляет видимую коробку и содержимое по-разному, и у невинного текста
 * разница выходит в доли пикселя. Целый пиксель её гасит, а настоящая
 * обрезка прячет минимум строку — там разница в десятки.
 */
const CLAMP_EPSILON = 1;

/**
 * Текст обрезан по строкам: содержимое выше видимой части.
 *
 * Считает по факту, а не по длине, поэтому одинаково верно отвечает на
 * длинное слово, ручной перенос строки, узкий экран и подменённый шрифт —
 * на всё, из-за чего строк выходит больше, чем знаков «положено».
 */
export function isTextClamped(box: {
  scrollHeight: number;
  clientHeight: number;
}): boolean {
  return box.scrollHeight - box.clientHeight > CLAMP_EPSILON;
}
