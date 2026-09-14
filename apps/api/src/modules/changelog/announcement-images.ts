import {
  ANNOUNCEMENT_MAX_IMAGES,
  type AnnouncementImageInput,
} from '@vedamatch/shared';

/**
 * Ключ картинки новости в хранилище. Форма присылает ключи тех картинок,
 * которые сама загрузила, — и принимаем только такие: иначе в новость можно
 * было бы вписать чужой объект бакета, скажем, приватное фото из галереи.
 */
export const ANNOUNCEMENT_IMAGE_KEY =
  /^announcements\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** Верхняя граница размера: сервер ужимает картинки до 1600 точек по ширине. */
const MAX_SIDE = 10_000;

export class AnnouncementImagesError extends Error {}

/**
 * Проверяет набор картинок из формы и возвращает его в сохраняемом порядке.
 *
 * Размеры приходят от формы, а она взяла их из ответа загрузки. Они нужны
 * только для разметки — чтобы лента не прыгала, пока картинка грузится, —
 * поэтому достаточно убедиться, что это разумные целые числа.
 */
export function normalizeAnnouncementImages(
  input: unknown,
): AnnouncementImageInput[] {
  if (!Array.isArray(input))
    throw new AnnouncementImagesError('Картинки должны прийти списком');
  if (input.length > ANNOUNCEMENT_MAX_IMAGES)
    throw new AnnouncementImagesError(
      `Не больше ${ANNOUNCEMENT_MAX_IMAGES} картинок в новости`,
    );

  const seen = new Set<string>();
  return input.map((raw) => {
    const item = (raw ?? {}) as Partial<AnnouncementImageInput>;
    const key = typeof item.key === 'string' ? item.key : '';
    if (!ANNOUNCEMENT_IMAGE_KEY.test(key))
      throw new AnnouncementImagesError('Картинка не из загрузки новостей');
    if (seen.has(key))
      throw new AnnouncementImagesError('Одна картинка добавлена дважды');
    seen.add(key);
    return { key, width: side(item.width), height: side(item.height) };
  });
}

function side(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SIDE
  )
    throw new AnnouncementImagesError('У картинки неверный размер');
  return value;
}
