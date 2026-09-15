// Чистая геометрия для генератора фирменных ассетов (VED-173).
//
// Ничего не читает и не пишет на диск и не знает про sharp — только числа и
// маски пикселей, поэтому легко покрывается тестами (`brand-geometry.test.mjs`,
// `node --test`) без реальных PNG.
//
// Контекст (см. `docs/service-module-contract.md`-стиль комментария — почему
// это отдельный модуль): `generate-brand-assets.mjs` резрешает через него,
// какую долю холста должен занимать знак, чтобы не быть обрезанным ни одной
// маской лаунчера — тремя независимыми потребителями:
//   - adaptive-иконка Android (безопасная зона — круг диаметром 66% холста,
//     `ADAPTIVE_BASELINE_PIXEL_SIZE = 108` в `@expo/prebuild-config`, круг —
//     66dp из них);
//   - `ic_launcher_round.webp` — тот же `icon.png` обрезается по кругу
//     диаметром 100% холста (`borderRadiusRatio: 0.5` в `withAndroidIcons.js`);
//   - монохромный слой (Android 13+ themed icons) — использует тот же
//     108dp-холст, что и adaptive-иконка.

/**
 * Расстояние от центра прямоугольника `width×height` до самого дальнего
 * закрашенного пикселя маски. Это и есть радиус минимальной окружности с
 * центром в центре холста, которая гарантированно вмещает весь рисунок —
 * дальше считать нечего, сам рисунок не обязан быть симметричным (шеврон
 * «M» шире у нижних углов, чем у верхних, где стоит глобус).
 *
 * @param {Uint8Array | number[]} mask - 0/1 (или любое truthy/falsy) на
 *   пиксель, длина `width * height`, построчно.
 */
export function maxCornerDistanceFromMask(mask, width, height) {
  if (width <= 0 || height <= 0) {
    throw new Error('maxCornerDistanceFromMask: width и height должны быть positive');
  }
  if (mask.length !== width * height) {
    throw new Error('maxCornerDistanceFromMask: длина маски не совпадает с width*height');
  }
  const cx = width / 2;
  const cy = height / 2;
  let max = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      // +0.5 — расстояние до центра пикселя, а не до его левого верхнего угла.
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > max) max = d;
    }
  }
  return max;
}

/**
 * Максимальная доля холста (0..1), в которую можно вписать рисунок методом
 * «contain» (сохраняя пропорции, ограничивающая сторона — `referenceDimension`,
 * то есть более длинная сторона обрезанного по чернилам прямоугольника), чтобы
 * ни один закрашенный пиксель не вышел за круг безопасной зоны диаметром
 * `safeDiameterRatio * canvasSize`.
 *
 * `margin` (0..1] — доля от точного касания круга, которую можно фактически
 * использовать; `margin: 1` кладёт самый дальний пиксель ровно на границу
 * круга (без запаса на сглаживание/иные маски лаунчеров), поэтому вызывающий
 * код обычно передаёт значение с запасом (например, 0.9).
 */
export function safeContainRatio({ maxCornerDistance, referenceDimension, safeDiameterRatio, margin = 1 }) {
  if (!(maxCornerDistance > 0)) {
    throw new Error('safeContainRatio: maxCornerDistance должен быть положительным');
  }
  if (!(referenceDimension > 0)) {
    throw new Error('safeContainRatio: referenceDimension должен быть положительным');
  }
  if (!(safeDiameterRatio > 0 && safeDiameterRatio <= 1)) {
    throw new Error('safeContainRatio: safeDiameterRatio должен быть в (0, 1]');
  }
  if (!(margin > 0 && margin <= 1)) {
    throw new Error('safeContainRatio: margin должен быть в (0, 1]');
  }
  const safeRadiusRatio = safeDiameterRatio / 2;
  return (safeRadiusRatio * referenceDimension * margin) / maxCornerDistance;
}

/**
 * Один пиксель RGBA → силуэт: RGB заменяется на сплошной цвет, альфа остаётся
 * прежней (сглаженные края переживают замену без ореола — тот же приём, что
 * `recolorMark` в `apps/web/scripts/generate-icons.mjs`), а пиксели тише
 * порога считаются шумом и стираются полностью, чтобы не оставлять на
 * прозрачном фоне полупрозрачную кайму.
 *
 * @param {[number, number, number, number]} pixel - r,g,b,a (0..255)
 * @param {{ color: [number, number, number]; threshold?: number }} options
 * @returns {[number, number, number, number]}
 */
export function silhouettePixel([, , , a], { color, threshold = 0 }) {
  if (color.length !== 3) {
    throw new Error('silhouettePixel: color должен быть [r, g, b]');
  }
  if (a <= threshold) return [0, 0, 0, 0];
  return [color[0], color[1], color[2], a];
}
