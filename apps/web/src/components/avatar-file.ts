/** Ограничения на фото аватара — те же, что проверяет API `profile/avatar`. */
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Текст ошибки для неподходящего файла или `null`, если файл годится. */
export function avatarFileError(
  file: Pick<File, "type" | "size">,
): string | null {
  if (!AVATAR_TYPES.includes(file.type))
    return "Разрешены только jpg, jpeg, png и webp";
  if (file.size > MAX_AVATAR_SIZE)
    return "Размер аватара не должен превышать 5 MB";
  return null;
}
