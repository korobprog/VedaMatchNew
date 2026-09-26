/**
 * Автоочистка копий на устройстве — чистая часть.
 *
 * Сама чистится только копия, которую оставила заливка («Оставить копию на
 * этом устройстве», `origin: "upload"`). Её никто не просил хранить вечно:
 * галочка стоит по умолчанию, и телефон забивался десятками своих же
 * киртанов. Такая копия уходит, если её не слушали `AUTO_COPY_TTL_MS`, или
 * когда нужно место под новую — сначала самые давно не слушанные.
 *
 * Скачанное кнопкой «На устройство» не трогаем никогда: человек сам сказал
 * «хочу это без сети», и молча отнять запись значит оставить его без музыки
 * ровно в дороге. Записи без `origin` (сохранённые до этой логики) считаются
 * скачанными — ошибиться в сторону «сохранить» дешевле.
 *
 * Файл при этом никуда не пропадает: он на сервере и играет оттуда.
 */
export const AUTO_COPY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface EvictableCopy {
  trackId: string;
  sizeBytes: number;
  savedAt: string;
  lastPlayedAt?: string;
  origin?: "upload" | "download";
}

function lastUsed(copy: EvictableCopy): number {
  const at = Date.parse(copy.lastPlayedAt ?? copy.savedAt);
  return Number.isFinite(at) ? at : 0;
}

/**
 * Какие копии убрать: все просроченные автоматические и, если нужно
 * освободить `needBytes`, ещё самые давно не слушанные автоматические.
 */
export function pickOfflineEvictions(
  copies: readonly EvictableCopy[],
  needBytes: number,
  now: Date,
): string[] {
  const auto = copies
    .filter((copy) => copy.origin === "upload")
    .sort((a, b) => lastUsed(a) - lastUsed(b));
  const cutoff = now.getTime() - AUTO_COPY_TTL_MS;

  const picked: string[] = [];
  let freed = 0;
  for (const copy of auto) {
    const expired = lastUsed(copy) < cutoff;
    if (!expired && freed >= needBytes) break;
    picked.push(copy.trackId);
    freed += Math.max(0, copy.sizeBytes);
  }
  return picked;
}
