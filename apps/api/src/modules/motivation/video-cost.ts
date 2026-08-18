/**
 * Оценка стоимости ролика.
 *
 * Провайдер не возвращает списанную сумму в ответе, поэтому считаем сами по его
 * же формуле. Тариф — за миллион видео-токенов, а токены складываются из
 * площади кадра, частоты и длительности:
 *
 *   токены = (высота × ширина × FPS × длительность) / 1024
 *
 * Проверено на живом счёте: ролик 704×1248, 24 fps, 5.04 с дал 0.10 M токенов
 * и $0.259545 по тарифу $2.50 за миллион.
 */

/** Частота, с которой модель отдаёт ролик. Замерено на выдаче. */
export const VIDEO_FPS = 24;

/** Тариф Seedance Pro Fast за миллион видео-токенов. У Pro — 2.5. */
export const DEFAULT_RATE_PER_MTOKENS = 1.0;

export function videoTokens(input: {
  width: number;
  height: number;
  seconds: number;
  fps?: number;
}): number {
  const fps = input.fps ?? VIDEO_FPS;
  return (input.height * input.width * fps * input.seconds) / 1024;
}

export function estimateVideoCostUsd(input: {
  width: number;
  height: number;
  seconds: number;
  fps?: number;
  ratePerMTokens?: number;
}): number {
  const rate = input.ratePerMTokens ?? DEFAULT_RATE_PER_MTOKENS;
  return (videoTokens(input) / 1_000_000) * rate;
}

/**
 * Во сколько обойдётся ролик, который мы собираемся заказать.
 *
 * Считается до отправки: на этом числе стоит дневной потолок расхода. Кадр мы
 * отдаём в 9:16, но модель ужимает его под своё разрешение, поэтому размер
 * берётся тот, что реально приходит с выдачи, а не размер исходника.
 */
export function estimatePlannedClipUsd(input: {
  seconds: number;
  ratePerMTokens?: number;
}): number {
  return estimateVideoCostUsd({
    width: 704,
    height: 1248,
    seconds: input.seconds,
    ratePerMTokens: input.ratePerMTokens,
  });
}
