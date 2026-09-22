/**
 * Подготовка снимка состава к отправке (VED-335, второй заход).
 *
 * Сервер принимает снимок не больше 4 МБ в base64
 * (`apps/api/.../label-recognition.ts`, `LABEL_IMAGE_MAX_BYTES`), а телефон
 * снимает 48 мегапикселей и пять мегабайт. На сайте лишнее срезает canvas
 * (`apps/web/.../scan-image.ts`, 1600 пикселей по длинной стороне); в
 * приложении canvas нет.
 *
 * Новую зависимость ради уменьшения картинки решено НЕ тянуть: `expo-camera`
 * умеет снимать в заданном разрешении (`pictureSize`), и этого достаточно —
 * состав читается и с 1600 пикселей, а ставить ещё один нативный модуль ради
 * одного вызова значит удлинять сборку и ревью витрины на пустом месте.
 *
 * Отсюда два правила, и оба здесь, отдельно от экрана, чтобы их можно было
 * проверить без телефона:
 *
 * 1. какое из доступных разрешений камеры выбрать;
 * 2. что делать, если снимок всё равно не влез.
 */

/** Столько же, сколько на сайте: состав читается и с 1600 пикселей. */
export const LABEL_TARGET_SIDE = 1600;

/** Предел сервера. Дублируется осознанно: телефон не должен отправлять зря. */
export const LABEL_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Качество JPEG для первой попытки и для второй, если первая не влезла.
 * Третьей нет: если и на 0.3 снимок больше четырёх мегабайт, дело не в
 * качестве, и человеку надо сказать правду, а не жать дальше.
 */
export const LABEL_QUALITY_STEPS = [0.6, 0.3] as const;

/**
 * Разрешение съёмки из списка, который отдаёт камера («1920x1080»,
 * «4032x3024» и подобные).
 *
 * Берём самое маленькое, у которого длинная сторона НЕ МЕНЬШЕ цели: мельче —
 * буквы состава на пачке перестают читаться, крупнее — лишние мегабайты по
 * мобильной сети в магазине. Если все меньше цели, берём самое крупное из
 * имеющихся: лучше мелкий снимок, чем отказ снимать вовсе.
 */
export function pickPictureSize(
  sizes: readonly string[],
  target = LABEL_TARGET_SIDE,
): string | null {
  const parsed = sizes
    .map((size) => {
      const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(size.trim());
      if (!match) return null;
      return { size, longest: Math.max(Number(match[1]), Number(match[2])) };
    })
    .filter((item): item is { size: string; longest: number } => item !== null);
  if (!parsed.length) return null;

  const big = parsed
    .filter((item) => item.longest >= target)
    .sort((a, b) => a.longest - b.longest);
  if (big.length) return big[0].size;

  return parsed.sort((a, b) => b.longest - a.longest)[0].size;
}

/** Сколько байтов в base64-строке: каждые 4 символа дают 3 байта. */
export function base64Bytes(payload: string): number {
  return Math.floor((payload.length * 3) / 4);
}

export function fitsLabelUpload(base64: string): boolean {
  return base64Bytes(base64) <= LABEL_MAX_BYTES;
}

/** Готовый data-URL для `POST wellness/recognize`. */
export function labelDataUrl(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

export type LabelShotDecision =
  /** Влезло — отправляем. */
  | { kind: 'send'; imageDataUrl: string }
  /** Не влезло, но есть более низкое качество — переснимаем им. */
  | { kind: 'retry'; quality: number }
  /** Качество кончилось: снимок не влезет, и надо сказать почему. */
  | { kind: 'too-big'; message: string };

export const LABEL_TOO_BIG_MESSAGE =
  'Снимок слишком большой даже после сжатия. Подойдите ближе к составу — в кадр не нужна вся упаковка.';

/**
 * Что делать с только что снятым кадром. Чистое решение отдельно от съёмки:
 * иначе «переснять с качеством похуже» проверялось бы только руками в
 * магазине.
 */
export function decideLabelShot(
  base64: string,
  attempt: number,
): LabelShotDecision {
  if (fitsLabelUpload(base64)) {
    return { kind: 'send', imageDataUrl: labelDataUrl(base64) };
  }
  const next = LABEL_QUALITY_STEPS[attempt + 1];
  if (next === undefined) {
    return { kind: 'too-big', message: LABEL_TOO_BIG_MESSAGE };
  }
  return { kind: 'retry', quality: next };
}
