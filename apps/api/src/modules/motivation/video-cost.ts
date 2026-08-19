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
 * Ставки провайдеров за секунду 720p. Сверены с прайсом fal и счётом за август
 * 2026: прежние значения были вдвое ниже фактических, и на них же стоял дневной
 * потолок — расход считался наполовину.
 *
 * Считают провайдеры по-разному: Seedance — по видео-токенам, Wan и Vidu — по
 * секундам. Держать одну формулу на всех нельзя: после перехода на Wan учёт
 * продолжал бы писать цену Seedance.
 */
const PER_SECOND_720P: ReadonlyArray<[string, number]> = [
  // Wan 2.6 flash: $0.05/с в 720p ($0.075 в 1080p). Скидки за немой ролик нет —
  // цена одна, звук на неё не влияет.
  ['wan/v2.6', 0.05],
  // Vidu Q3: $0.07/с для 360p и 540p, для 720p и выше множитель 2.2.
  ['vidu', 0.07 * 2.2],
];

/**
 * Тариф за миллион видео-токенов по имени модели. У Pro он вдвое с половиной
 * выше, чем у Pro Fast, и брать один на обе — снова считать половину расхода.
 */
const PER_MTOKENS: ReadonlyArray<[string, number]> = [
  ['seedance/v1/pro/fast', 1.0],
  ['seedance/v1/pro', 2.5],
];

/** Ставка за миллион токенов для модели; для незнакомой — осторожная верхняя. */
export function ratePerMTokensFor(model: string): number {
  return PER_MTOKENS.find(([key]) => model.includes(key))?.[1] ?? 2.5;
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
  model?: string;
  ratePerMTokens?: number;
}): number {
  const model = input.model ?? '';
  const perSecond = PER_SECOND_720P.find(([key]) => model.includes(key));
  if (perSecond) return input.seconds * perSecond[1];

  return estimateVideoCostUsd({
    width: 704,
    height: 1248,
    seconds: input.seconds,
    ratePerMTokens: input.ratePerMTokens ?? ratePerMTokensFor(model),
  });
}
