import type { MusicStorageUsageDto } from "@vedamatch/shared";

/**
 * Партия файлов против квоты загрузок — до заливки (раньше это делал
 * только сервер: на каждый файл, по одному, и тридцать одинаковых строк
 * «Закончилось место» подряд).
 *
 * Файлы уходят по порядку, поэтому помещается ровно их начало: первый
 * файл, который не влез, останавливает и все следующие — место общее.
 */
export interface UploadBatchPlan {
  /** Сколько файлов с начала списка поместятся. */
  fits: number;
  /** Свободно до заливки; `null` — без ограничения. */
  freeBytes: number | null;
  /** Сколько весят не поместившиеся. */
  overflowBytes: number;
}

export function planUploadBatch(
  sizes: readonly number[],
  usage: Pick<
    MusicStorageUsageDto,
    "usedBytes" | "quotaBytes" | "unlimited"
  > | null,
): UploadBatchPlan {
  // Не узнали, сколько свободно, — решит сервер, как раньше.
  if (!usage || usage.unlimited) {
    return { fits: sizes.length, freeBytes: null, overflowBytes: 0 };
  }
  const freeBytes = Math.max(0, usage.quotaBytes - usage.usedBytes);
  let left = freeBytes;
  let fits = 0;
  while (fits < sizes.length && sizes[fits] <= left) {
    left -= sizes[fits];
    fits += 1;
  }
  const overflowBytes = sizes.slice(fits).reduce((sum, size) => sum + size, 0);
  return { fits, freeBytes, overflowBytes };
}

/** Отказ сервера по квоте — общий для всей партии, а не для одного файла. */
export function isQuotaRejection(message: string): boolean {
  return message.startsWith("Закончилось место");
}

/**
 * Одно сообщение вместо строки на каждый файл: сколько не поместилось,
 * сколько свободно и что с этим делать. Опубликованное место не занимает —
 * освободить его можно только отклонёнными или дождавшись проверки.
 */
export function quotaSummary(
  skipped: number,
  total: number,
  freeBytes: number | null,
  formatBytes: (bytes: number) => string,
): string {
  const free = freeBytes === null ? "" : ` Свободно ${formatBytes(freeBytes)}.`;
  const what =
    skipped === total
      ? "Ни один файл не поместился"
      : `Не поместилось ${skipped} из ${total}`;
  return `${what}: закончилось место для записей на проверке.${free} Удалите отклонённые записи ниже или дождитесь проверки — опубликованные место не занимают.`;
}
