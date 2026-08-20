/**
 * Запрос картинки к fal и разбор его ответа.
 *
 * Вынесено из сервиса, чтобы покрыть тестами без сети: форма тела у моделей
 * различается мелочами, а ошибка в ней стоит денег — провайдер уже показывал,
 * что выставляет счёт и за запрос, который не смог разобрать
 * (см. комментарий к buildVideoRequest).
 */

/** Размер по умолчанию совпадает с основным поставщиком: вертикаль 9:16. */
export function buildFalImageRequest(input: {
  prompt: string;
  size: string;
}): Record<string, unknown> {
  const [width, height] = input.size
    .split('x')
    .map((part) => Number(part.trim()));
  const request: Record<string, unknown> = { prompt: input.prompt };
  // Пресеты вроде `portrait_16_9` дают своё разрешение; нам нужен ровно тот
  // же кадр, что у основного поставщика, поэтому размер задаём числами.
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  )
    request.image_size = { width, height };
  return request;
}

/**
 * Ссылка на готовую картинку из ответа очереди.
 *
 * Модели отвечают по-разному: у большинства это `images[0].url`, у некоторых —
 * одиночный `image.url`. Возвращаем null, а не бросаем: решение, считать это
 * сбоем или нет, принимает вызывающий.
 */
export function parseFalImageUrl(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as {
    images?: Array<{ url?: unknown }>;
    image?: { url?: unknown };
  };
  const url = body.images?.[0]?.url ?? body.image?.url;
  return typeof url === 'string' && url.startsWith('http') ? url : null;
}
