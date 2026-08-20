/**
 * Стоимость кадра.
 *
 * gpt-image-2 тарифицируется не по токенам, а за запрос, и цена зависит только
 * от большей стороны: до 1792 px включительно — одна ставка, 2K/4K и всё, что
 * больше 1792 px, — вдвое дороже.
 *
 * Ставки берём по счёту релея, через который идёт генерация: у него на эту
 * модель скидка 98% от прайса OpenAI ($0.5 и $1 за изображение), и платим мы
 * центы, а не полдоллара. Если релей скидку снимет, цифры ниже — единственное,
 * что нужно поправить; сверять их стоит на https://relay.fast/pricing.
 *
 * Пока эта цена нигде не записывалась, `estimatedCostUsd` у каждого поста
 * оставался нулём, а дневной потолок расхода сторожил один только видеоряд —
 * кадры уходили мимо счётчика.
 */

/** Размер, который мы просим у модели. Вертикаль 9:16 под ленту рилсов. */
export const IMAGE_SIZE = '1024x1536';

/** Граница тарифа: до неё включительно — дешёвая ставка. */
const LARGE_SIDE_PX = 1792;

const RATE_SMALL_USD = 0.01;
const RATE_LARGE_USD = 0.02;

/** Кто нарисовал кадр: основной релей или запасной fal. */
export type ImageProvider = 'relay' | 'fal';

/**
 * Ставка запасного поставщика.
 *
 * Seedream V4 у fal — фиксированные $0.03 за изображение, независимо от
 * разрешения. Ставка привязана к модели из `MOTIVATION_IMAGE_MODEL_FALLBACK`:
 * меняете модель — правьте и это число, иначе дневной потолок расхода соврёт
 * в меньшую сторону. Сверять на https://fal.ai/pricing.
 */
export const FAL_IMAGE_RATE_USD = 0.03;

/** Большая сторона из строки вида `1024x1536`; для неразобранной — 0. */
export function largestSidePx(size: string): number {
  const sides = size
    .split('x')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  return sides.length === 2 ? Math.max(...sides) : 0;
}

/**
 * Во сколько обойдётся один кадр запрошенного размера.
 *
 * Неразобранный размер считаем по верхней ставке: занизить расход опаснее,
 * чем завысить, — на этой сумме стоит дневной потолок.
 */
export function estimateImageCostUsd(
  size: string = IMAGE_SIZE,
  provider: ImageProvider = 'relay',
): number {
  // У fal цена не зависит от разрешения, поэтому размер здесь не при чём.
  if (provider === 'fal') return FAL_IMAGE_RATE_USD;
  const side = largestSidePx(size);
  if (!side) return RATE_LARGE_USD;
  return side <= LARGE_SIDE_PX ? RATE_SMALL_USD : RATE_LARGE_USD;
}
