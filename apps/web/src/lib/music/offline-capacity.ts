/**
 * Хватит ли места под запись. Чистая логика, отдельно от хранилища:
 * ошибка здесь не падает, а даёт человеку выкачать киртан наполовину и
 * получить вытеснение всего сохранённого — браузер чистит хранилище
 * целиком, а не по одному файлу.
 */

/**
 * Запас, который не занимаем. Браузеры начинают вытеснять задолго до нуля,
 * и заполнить квоту под завязку значит потерять всё сохранённое разом.
 */
const HEADROOM_RATIO = 0.15;

export interface StorageEstimateLike {
  quota?: number;
  usage?: number;
}

export type MusicCapacityVerdict =
  | { ok: true; freeBytes: number }
  | { ok: false; reason: string };

/**
 * `quota === undefined` — браузер не говорит, сколько можно. Отказываем:
 * скачать сто мегабайт вслепую и упасть на записи хуже честного «не знаю».
 */
export function canFitOffline(
  estimate: StorageEstimateLike | null,
  sizeBytes: number,
): MusicCapacityVerdict {
  if (!estimate || estimate.quota === undefined) {
    return {
      ok: false,
      reason: "Браузер не сообщает, сколько места доступно",
    };
  }

  const quota = Math.max(0, estimate.quota);
  const usage = Math.max(0, estimate.usage ?? 0);
  const free = Math.max(0, quota - usage - quota * HEADROOM_RATIO);

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, reason: "Размер записи неизвестен" };
  }
  if (sizeBytes > free) {
    return {
      ok: false,
      reason: `Не хватает места: нужно ${formatBytes(sizeBytes)}, свободно ${formatBytes(free)}`,
    };
  }
  return { ok: true, freeBytes: free };
}

/** Размер словами. Мегабайты, потому что записи меряются ими. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 МБ";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return "меньше 1 МБ";
  if (mb < 1024) return `${Math.round(mb)} МБ`;
  return `${(mb / 1024).toFixed(1).replace(".", ",")} ГБ`;
}
