/**
 * Дата подписи ссылки, одинаковая в пределах окна (VED-498).
 *
 * `getSignedUrl` по умолчанию подписывает «сейчас», и ссылка на один и тот же
 * файл на каждом запросе выходит новой — браузер считает её другой
 * картинкой и качает аватарку заново на каждой странице. С датой,
 * округлённой вниз до начала окна, ссылка в течение окна одна и та же, и
 * картинка берётся из кэша браузера.
 *
 * Срок жизни ссылки обязан быть больше окна: подписанная в начале окна, она
 * должна дожить до его конца (`stableSignedTtl`).
 */
export const STABLE_SIGNING_WINDOW_SECONDS = 24 * 60 * 60;

export function stableSigningDate(
  now: Date = new Date(),
  windowSeconds = STABLE_SIGNING_WINDOW_SECONDS,
): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * Срок жизни, с которым подписывать: нужный срок плюс окно — ссылка,
 * подписанная в начале окна и выданная в его конце, живёт не меньше
 * `ttlSeconds`. S3 не принимает больше семи суток, поэтому потолок.
 */
export function stableSignedTtl(
  ttlSeconds: number,
  windowSeconds = STABLE_SIGNING_WINDOW_SECONDS,
): number {
  return Math.min(7 * 24 * 60 * 60, ttlSeconds + windowSeconds);
}
