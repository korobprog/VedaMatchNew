/**
 * На сколько прокрутить ленту, чтобы сообщение оказалось по центру.
 *
 * Считаем сами, а не полагаемся на `scrollIntoView`: вызванный из эффекта
 * React он молча ничего не делал — лента оставалась на месте, хотя тот же
 * вызов из консоли работал. Арифметика предсказуема и проверяема.
 *
 * Все величины — в координатах окна, как их отдаёт `getBoundingClientRect`.
 */
export function scrollDeltaToCenter(box: {
  laneTop: number;
  laneHeight: number;
  targetTop: number;
  targetHeight: number;
}): number {
  const targetCentre = box.targetTop + box.targetHeight / 2;
  const laneCentre = box.laneTop + box.laneHeight / 2;
  return targetCentre - laneCentre;
}
