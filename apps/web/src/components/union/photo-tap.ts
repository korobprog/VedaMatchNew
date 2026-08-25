/**
 * Тап по половинам фотографии. Вынесено отдельно от карусели: слой тапа
 * лежит поверх перетаскиваемой карточки, и вся тонкость — в отличии тапа от
 * свайпа. В jsdom `getBoundingClientRect` возвращает нули, поэтому арифметика
 * живёт здесь и проверяется без DOM.
 */

/** Допустимое дрожание пальца, px. Больше — это уже свайп карточки. */
export const TAP_SLOP = 10;

export function isTap(
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  return (
    Math.abs(end.x - start.x) <= TAP_SLOP && Math.abs(end.y - start.y) <= TAP_SLOP
  );
}

/** Правая половина — следующее фото, левая — предыдущее, по кругу. */
export function tappedPhotoIndex({
  currentIndex,
  total,
  tapX,
  boundsLeft,
  boundsWidth,
}: {
  currentIndex: number;
  total: number;
  tapX: number;
  boundsLeft: number;
  boundsWidth: number;
}): number {
  const forward = tapX - boundsLeft > boundsWidth / 2;
  return forward
    ? (currentIndex + 1) % total
    : (currentIndex - 1 + total) % total;
}
