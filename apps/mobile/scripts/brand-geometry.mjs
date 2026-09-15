// Чистая геометрия для генератора фирменных ассетов (VED-173).
//
// Ничего не читает и не пишет на диск и не знает про sharp — только числа и
// маски пикселей, поэтому легко покрывается тестами (`brand-geometry.test.mjs`,
// `node --test`) без реальных PNG.
//
// Контекст (см. `docs/service-module-contract.md`-стиль комментария — почему
// это отдельный модуль): `generate-brand-assets.mjs` резрешает через него,
// какую долю холста должен занимать знак, чтобы не быть обрезанным ни одной
// маской лаунчера — несколькими независимыми потребителями:
//   - adaptive-иконка Android (гарантированная безопасная зона — окружность
//     диаметром 66% холста, `ADAPTIVE_BASELINE_PIXEL_SIZE = 108` в
//     `@expo/prebuild-config`; видимая большинством лаунчеров область — как
//     правило шире, около 72dp из тех же 108, и по форме это не круг, а
//     сквиркл/скруглённый квадрат — Samsung One UI и похожие);
//   - `ic_launcher_round.webp` — тот же `icon.png` обрезается по кругу
//     диаметром 100% холста (`borderRadiusRatio: 0.5` в `withAndroidIcons.js`);
//   - монохромный слой (Android 13+ themed icons) — использует тот же
//     108dp-холст, что и adaptive-иконка.
//
// `exponent` в `maxCornerDistanceFromMask`/`isInsideSquircle` переключает
// метрику между этими двумя формами: `2` — строгий круг (никогда не
// обрезается никаким лаунчером, включая самые консервативные), больше —
// приближение сквиркла (даёт больше места на диагоналях, ближе к тому, что
// реально показывает большинство лаунчеров).

/**
 * «Расстояние» (p-норма степени `exponent`) от центра прямоугольника
 * `width×height` до самого дальнего закрашенного пикселя маски.
 *
 * При `exponent = 2` (по умолчанию) это обычное евклидово расстояние — радиус
 * минимальной ОКРУЖНОСТИ с центром в центре холста, которая гарантированно
 * вмещает весь рисунок. При большем `exponent` метрика моделирует не круг, а
 * сквиркл (суперэллипс `|dx/a|^n + |dy/a|^n = 1`) — реальную форму маски
 * многих лаунчеров (Samsung One UI и похожие), которая на диагонали
 * «дотягивается» дальше круга того же осевого радиуса. Дальше считать
 * нечего, сам рисунок не обязан быть симметричным (шеврон «M» шире у нижних
 * углов, чем у верхних, где стоит глобус).
 *
 * @param {Uint8Array | number[]} mask - 0/1 (или любое truthy/falsy) на
 *   пиксель, длина `width * height`, построчно.
 * @param {number} [exponent] - степень p-нормы; 2 — круг, больше — сквиркл.
 */
export function maxCornerDistanceFromMask(mask, width, height, exponent = 2) {
  if (width <= 0 || height <= 0) {
    throw new Error('maxCornerDistanceFromMask: width и height должны быть positive');
  }
  if (mask.length !== width * height) {
    throw new Error('maxCornerDistanceFromMask: длина маски не совпадает с width*height');
  }
  if (!(exponent >= 2)) {
    throw new Error('maxCornerDistanceFromMask: exponent должен быть ≥ 2 (2 — круг)');
  }
  const cx = width / 2;
  const cy = height / 2;
  let max = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      // +0.5 — расстояние до центра пикселя, а не до его левого верхнего угла.
      const dx = Math.abs(x + 0.5 - cx);
      const dy = Math.abs(y + 0.5 - cy);
      const d = exponent === 2 ? Math.hypot(dx, dy) : (dx ** exponent + dy ** exponent) ** (1 / exponent);
      if (d > max) max = d;
    }
  }
  return max;
}

/**
 * Точка `(dx, dy)` (смещение от центра) внутри круга радиуса `radius`?
 * Тривиальная, но отдельная функция — используется скриптом проверки,
 * чтобы строить одну и ту же геометрию, что и `maxCornerDistanceFromMask`
 * с `exponent = 2`, а не пересчитывать её на месте.
 */
export function isInsideCircle(dx, dy, radius) {
  if (!(radius > 0)) {
    throw new Error('isInsideCircle: radius должен быть положительным');
  }
  return Math.hypot(dx, dy) <= radius;
}

/**
 * Точка `(dx, dy)` внутри сквиркла (суперэллипса) с «осевым радиусом»
 * `halfSize` и степенью `exponent`? При `exponent = 2` это ровно круг радиуса
 * `halfSize` — та же метрика, что и в `maxCornerDistanceFromMask`.
 */
export function isInsideSquircle(dx, dy, halfSize, exponent) {
  if (!(halfSize > 0)) {
    throw new Error('isInsideSquircle: halfSize должен быть положительным');
  }
  if (!(exponent >= 2)) {
    throw new Error('isInsideSquircle: exponent должен быть ≥ 2 (2 — круг)');
  }
  return (Math.abs(dx) / halfSize) ** exponent + (Math.abs(dy) / halfSize) ** exponent <= 1;
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
