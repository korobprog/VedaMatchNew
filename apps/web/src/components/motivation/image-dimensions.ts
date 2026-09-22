/**
 * Размеры выбранной картинки и отказ по ним (VED-328).
 *
 * Раньше сторону кадра проверял только сервер — в момент публикации. Человек
 * выбирал файл, форма отвечала «Картинка взята», он набирал категорию, автора
 * и текст с картинки, жал «Опубликовать» и у самой кнопки читал «Картинка
 * слишком маленькая». Отказ приходил за полминуты работы до того, как что-то
 * можно было исправить, и не называл, какая же у картинки сторона.
 *
 * Поэтому здесь два куска. Чистый — `imageSizeRejection`: только арифметика
 * границы, её и покрывает тест. И `readImageSize` — обёртка над браузером,
 * которая эти размеры добывает; она в jsdom не живёт, зато и решать ей нечего.
 *
 * Порог повторяет серверный `MIN_REEL_IMAGE_SIDE`
 * (`apps/api/src/modules/motivation/reel-image.ts`) — как и остальные правила
 * в `clipboard-image.ts`: это другое приложение, тянуть серверный модуль на
 * веб нельзя, но расходиться им нельзя тоже.
 */

export const REEL_IMAGE_MIN_SIDE = 400;

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * `null` — размеры подходят, картинку можно принимать.
 *
 * `null` на входе значит «размеры снять не удалось». Это отдельный ответ, а не
 * «слишком маленькая»: у неснятого замера все стороны нулевые, и объявить
 * мелким файл, который никто не мерил, — соврать человеку о его картинке.
 * Ровно `REEL_IMAGE_MIN_SIDE` проходит: граница включительная, как на сервере.
 */
export function imageSizeRejection(size: ImageSize | null): string | null {
  if (!size) return "Не удалось прочитать картинку — попробуйте другой файл";
  const { width, height } = size;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return "Не удалось прочитать картинку — попробуйте другой файл";
  if (Math.min(width, height) < REEL_IMAGE_MIN_SIDE)
    return `Картинка ${Math.round(width)}×${Math.round(height)} — нужна сторона хотя бы ${REEL_IMAGE_MIN_SIDE} точек`;
  return null;
}

/**
 * Размеры картинки в браузере. `null` — файл не картинка либо его не разобрали.
 *
 * Два пути намеренно. `createImageBitmap` — основной: он не трогает вёрстку и
 * одинаково отвечает и на файл из галереи, и на вставку из буфера (у обоих на
 * входе один `Blob`). `<img>` — запасной для браузеров без него, и там важно
 * дождаться `onload`: у незагруженной картинки `naturalWidth` равен нулю, и
 * замер «до загрузки» выдал бы годный кадр за мелкий.
 */
export async function readImageSize(file: Blob): Promise<ImageSize | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      // Формат, который не осилил декодер, — пробуем через <img>.
    }
  }
  return readImageSizeViaElement(file);
}

/**
 * Сколько ждём ответа от `<img>`. Ответ обязан прийти: без него форма молчит
 * — картинку не приняла и не отвергла, — и это хуже позднего отказа, который
 * мы здесь и чиним. Не дождались — честно говорим, что не прочитали.
 */
const ELEMENT_DECODE_TIMEOUT_MS = 10_000;

function readImageSizeViaElement(file: Blob): Promise<ImageSize | null> {
  if (typeof Image !== "function" || typeof URL?.createObjectURL !== "function")
    return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;
    const finish = (size: ImageSize | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(size);
    };
    const timer = setTimeout(() => finish(null), ELEMENT_DECODE_TIMEOUT_MS);
    image.onload = () =>
      finish({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => finish(null);
    image.src = url;
  });
}
