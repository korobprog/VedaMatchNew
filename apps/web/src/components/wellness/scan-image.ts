/**
 * Подготовка снимка этикетки к отправке.
 *
 * Телефон снимает 12 мегапикселей и 5 МБ; состав читается и с 1600 пикселей по
 * длинной стороне. Уменьшение здесь, в браузере, а не на сервере: иначе
 * человек в магазине на мобильном интернете ждёт загрузку впустую.
 */
export const SCAN_IMAGE_MAX_SIDE = 1600;
export const SCAN_IMAGE_QUALITY = 0.8;

/** Во сколько раз ужать, чтобы длинная сторона влезла в предел. */
export function scaleForSide(
  width: number,
  height: number,
  maxSide = SCAN_IMAGE_MAX_SIDE,
): number {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) return 1;
  return maxSide / longest;
}

export async function fileToScanImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = scaleForSide(bitmap.width, bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось подготовить снимок");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", SCAN_IMAGE_QUALITY);
}
