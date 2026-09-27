import type {
  LibraryLocale,
  LibraryShlokaSourceFolder,
} from "@vedamatch/shared";
import { st } from "./shloka-text";

/**
 * Папки-источники рубрики «Шлоки» (VED-465): адреса и подписи. Сами папки
 * собирает сервер (`GET library/shlokas/sources`) — здесь только то, что
 * нужно странице, чтобы на них сослаться.
 */

/** Папка открывается на той же странице рубрики — с ключом в адресе. */
export function shlokaFolderHref(categorySlug: string, key: string): string {
  return `/library/${encodeURIComponent(categorySlug)}?source=${encodeURIComponent(key)}`;
}

/** Ключ папки из адреса страницы; пустое и повторённое — «папки нет». */
export function folderKeyFromQuery(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key ? key : null;
}

export function folderTitle(
  locale: LibraryLocale,
  folder: Pick<LibraryShlokaSourceFolder, "label">,
): string {
  return folder.label ?? st(locale, "folders.none");
}

/**
 * «Добавить шлоку» из папки: источник в форме уже вписан — человек пришёл
 * из «Бхагавад-гиты» и пишет стих «Бхагавад-гиты». Из «Без источника» и из
 * списка папок — поле пустое (VED-464).
 */
export function addShlokaHref(
  categorySlug: string,
  source?: string | null,
): string {
  const params = new URLSearchParams({ category: categorySlug });
  if (source) params.set("source", source);
  return `/library/add/shloka?${params.toString()}`;
}
