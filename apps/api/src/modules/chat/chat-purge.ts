/**
 * Чистая логика удаления файлов «Общения» вместе с аккаунтом.
 *
 * Пересылка сообщения копирует вложение вместе с ключом в S3: у копии тот же
 * объект в бакете, что и у оригинала. Поэтому ключи уходящего человека нельзя
 * отдавать порталу списком как есть — сначала надо вычесть те, на которые
 * ссылается хоть одно чужое сообщение, иначе удаление аккаунта ломает картинку
 * в чужой переписке.
 *
 * Вынесено отдельно от слушателя, чтобы покрываться тестом без Prisma и шины.
 */
export function orphanStorageKeys(
  leaving: readonly (string | null)[],
  surviving: readonly (string | null)[],
): string[] {
  const kept = new Set(surviving.filter((key): key is string => Boolean(key)));
  const orphans = leaving.filter(
    (key): key is string => Boolean(key) && !kept.has(key as string),
  );
  return [...new Set(orphans)];
}
