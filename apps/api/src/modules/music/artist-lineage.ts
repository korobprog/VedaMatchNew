import type { LineageId } from '@vedamatch/shared';
import { isLineageId, toLineageId } from '@vedamatch/shared';

/**
 * Линия новой записи (VED-566): явная — та, что выбрали при загрузке или у
 * партии; не выбрана — линия исполнителя. Исполнитель без линии оставляет
 * запись без неё, то есть «слышат все», как и до VED-566.
 *
 * Явная сильнее исполнителя: её выставили осознанно для этой записи, а линия
 * исполнителя — только разметка по умолчанию. Строка из базы вне
 * справочника читается как «нет», чтобы мусор не уехал в каталог.
 */
export function trackLineageWithArtistDefault(
  explicit: string | null | undefined,
  artistLineage: string | null | undefined,
): LineageId | null {
  return isLineageId(explicit) ? explicit : toLineageId(artistLineage);
}

/**
 * То же для записи, у которой исполнитель известен только идентификатором
 * (приём партии): линию исполнителя дочитываем, лишь когда она нужна — у
 * партии своей линии нет, а исполнитель есть. Загрузчик передаётся снаружи,
 * чтобы правило проверялось без базы.
 */
export async function resolveTrackLineage(
  explicit: string | null | undefined,
  artistId: string | null | undefined,
  loadArtistLineage: (artistId: string) => Promise<string | null | undefined>,
): Promise<LineageId | null> {
  if (isLineageId(explicit) || !artistId) {
    return trackLineageWithArtistDefault(explicit, null);
  }
  return trackLineageWithArtistDefault(
    explicit,
    await loadArtistLineage(artistId),
  );
}
