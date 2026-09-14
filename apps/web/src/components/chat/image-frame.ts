/**
 * Картинки в переписке не должны сдвигать ленту (VED-148).
 *
 * Лента докручивается вниз, когда меняется число сообщений. Отправленное
 * фото сначала лежит черновиком без адреса, а настоящее сообщение встаёт на
 * его место — число сообщений не меняется. Картинка подгружалась позже и
 * вырастала на пару сотен точек ниже края экрана, прокрутка не двигалась, и
 * для человека фото «исчезало» до перезагрузки. Отсюда «со второго раза»:
 * второе отправленное сообщение меняло счётчик и докручивало ленту.
 */

/** Пропорция кадра для `aspect-ratio`; `null` — размеры неизвестны. */
export function imageAspect(
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return `${width} / ${height}`;
}

/** Насколько близко к низу ленты человек ещё считается «внизу». */
export const STICK_TO_BOTTOM_PX = 120;

/**
 * Докрутить ли ленту вниз после того, как картинка догрузилась и выросла.
 *
 * Считаем по положению до роста: если человек был внизу — он ждёт своё
 * сообщение и должен его увидеть; если листает историю выше — прыжок вниз
 * отнял бы у него место, где он читает.
 */
export function shouldStickToBottom({
  distanceFromBottom,
  grownBy,
}: {
  /** `scrollHeight - scrollTop - clientHeight` уже после роста. */
  distanceFromBottom: number;
  /** На сколько выросла картинка. */
  grownBy: number;
}): boolean {
  return distanceFromBottom - grownBy <= STICK_TO_BOTTOM_PX;
}
