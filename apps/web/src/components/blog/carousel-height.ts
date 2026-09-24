/**
 * Высота карусели по видимым слайдам (VED-443).
 *
 * На главной у каждого поста своя пропорция: картинка встаёт во всю ширину,
 * а не вписывается в рамку первого поста с полями по бокам. Высота ленты
 * тогда — по самому высокому из слайдов, что сейчас в окне: пока палец
 * тащит между двумя, видны оба, и ни один не обрезается; после щелчка к
 * слайду высота садится ровно по нему.
 *
 * `null` — мерить нечего (ещё не отрисовано): высоту не задаём.
 */
export interface SlideBox {
  left: number;
  width: number;
  height: number;
}

export function visibleSlidesHeight(
  slides: readonly SlideBox[],
  viewLeft: number,
  viewWidth: number,
): number | null {
  const viewRight = viewLeft + viewWidth;
  let tallest: number | null = null;
  for (const slide of slides) {
    // Слайд, от которого в окне меньше пикселя, — уже не в окне: иначе
    // соседний, стоящий вплотную к краю, держал бы высоту за собой.
    const overlap =
      Math.min(slide.left + slide.width, viewRight) -
      Math.max(slide.left, viewLeft);
    if (overlap < 1) continue;
    if (tallest === null || slide.height > tallest) tallest = slide.height;
  }
  return tallest;
}
