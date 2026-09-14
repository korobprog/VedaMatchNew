/**
 * Высота поля ввода сообщения (VED-147).
 *
 * Поле было в одну строку и не росло: набранное уезжало вверх, и на
 * телефоне из длинного сообщения были видны полторы строки. Теперь оно
 * растёт вместе с текстом — до доли высоты экрана, дальше прокручивается:
 * иначе при открытой клавиатуре поле вытеснило бы саму переписку.
 */

/** Одна строка: как было, чтобы пустое поле не стало выше кнопок рядом. */
export const COMPOSER_MIN_HEIGHT = 44;

/** Доля высоты окна, до которой поле растёт. */
export const COMPOSER_MAX_SHARE = 0.4;

/** Нижняя граница потолка: на совсем низком окне всё равно видно ~4 строки. */
const COMPOSER_MAX_FLOOR = 112;

export function composerHeight(
  contentHeight: number,
  viewportHeight: number,
): { height: number; scrolls: boolean } {
  const max = Math.max(
    COMPOSER_MAX_FLOOR,
    Math.round(viewportHeight * COMPOSER_MAX_SHARE),
  );
  const height = Math.min(
    Math.max(Math.ceil(contentHeight), COMPOSER_MIN_HEIGHT),
    max,
  );
  return { height, scrolls: contentHeight > max };
}
