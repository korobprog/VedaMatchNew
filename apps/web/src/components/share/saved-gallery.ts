/**
 * «Галерея» на экране «Поделиться» (VED-353): картинки, которые человек уже
 * сохранял отсюда.
 *
 * Сохранённый файл уходит в «Загрузки» телефона, и заглянуть туда страница
 * не может. Поэтому экран сам запоминает, что отсюда сохраняли, — на этом
 * устройстве, в `localStorage`: картинки лежат в памяти этого же телефона, и
 * на другом устройстве список «уже сохранённого» был бы неправдой.
 *
 * Чистый модуль: разбор, добавление и предел проверяются тестом.
 */

export const SAVED_GALLERY_STORAGE_KEY = "vedamatch:share-gallery";

/** Больше этого не храним: список — память о недавнем, а не архив. */
export const SAVED_GALLERY_MAX = 60;

export interface SavedPicture {
  /** Путь к файлу на нашем домене (`/m/<slug>/story`) — им же и дедуплицируем. */
  file: string;
  /** Экран «Поделиться» этой картинки: оттуда её сохраняют снова. */
  sharePath: string;
  /** Миниатюра: превью карточки, если сервис его дал, иначе сам файл. */
  thumb: string;
  /** Начало текста — подпись для скринридера и `title`. */
  text: string;
  /** Когда сохранили, мс. */
  savedAt: number;
}

const TEXT_MAX = 140;

/** Свой путь без схемы и хоста: чужой адрес в галерею не пускаем. */
function ownPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    value.length <= 2000
  );
}

/** Миниатюра — свой путь или https-адрес хранилища (подписанное превью). */
function thumbUrl(value: unknown): value is string {
  return (
    ownPath(value) ||
    (typeof value === "string" &&
      value.startsWith("https://") &&
      value.length <= 4000)
  );
}

/** Сократить текст до подписи. */
export function galleryCaption(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= TEXT_MAX
    ? line
    : `${line.slice(0, TEXT_MAX - 1).trimEnd()}…`;
}

/**
 * Разобрать сохранённое. Битая строка или чужие поля — пустой список, а не
 * падение экрана: в `localStorage` могло остаться что угодно.
 */
export function parseSavedGallery(raw: string | null): SavedPicture[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const list: SavedPicture[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (!ownPath(entry.file) || !ownPath(entry.sharePath)) continue;
    if (seen.has(entry.file)) continue;
    seen.add(entry.file);
    list.push({
      file: entry.file,
      sharePath: entry.sharePath,
      thumb: thumbUrl(entry.thumb) ? entry.thumb : entry.file,
      text: typeof entry.text === "string" ? galleryCaption(entry.text) : "",
      savedAt: typeof entry.savedAt === "number" ? entry.savedAt : 0,
    });
    if (list.length >= SAVED_GALLERY_MAX) break;
  }
  return list;
}

/**
 * Добавить сохранённую картинку первой. Та же картинка, сохранённая снова
 * (в другом качестве или повторно), не дублируется, а поднимается наверх.
 */
export function addSavedPicture(
  list: readonly SavedPicture[],
  picture: SavedPicture,
): SavedPicture[] {
  const entry: SavedPicture = {
    ...picture,
    text: galleryCaption(picture.text),
    thumb: thumbUrl(picture.thumb) ? picture.thumb : picture.file,
  };
  return [entry, ...list.filter((item) => item.file !== picture.file)].slice(
    0,
    SAVED_GALLERY_MAX,
  );
}
