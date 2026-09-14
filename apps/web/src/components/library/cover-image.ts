/**
 * Выбор картинки-обложки материала Образования.
 *
 * Сервер принимает ровно эти три типа (`PREVIEW_MIME_TYPES` в
 * library-entries.service.ts); остальное он отбивает `unsupported_image_type`.
 */
export const COVER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * `accept` для поля выбора обложки.
 *
 * Лишний `application/octet-stream` — не опечатка (VED-134). Chrome на
 * Android открывает системную «Галерею фото», когда поле принимает одни
 * картинки или видео, а в ней нет файлового менеджера: картинку из загрузок
 * или со скачанной папки не выбрать. С любым другим типом в списке Chrome
 * открывает общий выбор файлов — там и галерея, и «Файлы». Что пришло не
 * картинкой, отсекает `isCoverImage` ещё до отправки.
 */
export const COVER_IMAGE_ACCEPT = [
  ...COVER_IMAGE_TYPES,
  "application/octet-stream",
].join(",");

export function isCoverImage(file: Pick<File, "type">): boolean {
  return COVER_IMAGE_TYPES.includes(file.type);
}
