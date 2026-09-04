import type { MusicIngestBatchStatus, MusicIngestItemStatus } from '@vedamatch/shared';

/**
 * Состояние партии и её позиций.
 *
 * Чистыми функциями, а не методами сервиса: правила «когда партия готова» и
 * «когда позиция зависла» — единственное здесь, что можно испортить незаметно,
 * и проверять их базой незачем.
 */

/** Три попытки, потом позиция признаётся упавшей и ждёт решения человека. */
export const INGEST_MAX_ATTEMPTS = 3;

/**
 * Полчаса — не норматив скачивания, а признак того, что процесс, взявший
 * позицию, до неё уже не вернётся: перезапуск деплоя, падение, обрыв.
 * Файл в 150 МБ по медленному каналу в этот срок укладывается.
 */
export const INGEST_STALE_MS = 30 * 60 * 1000;

export interface IngestItemState {
  status: MusicIngestItemStatus;
}

/**
 * Статус партии по её позициям.
 *
 * `ready` — доставлено хоть что-то и никто больше не в работе: дальше
 * человек правит метаданные и публикует. `failed` — работа кончилась, но не
 * появилось ни одной новой записи; пропуск дублей сюда тоже попадает, потому
 * что публиковать в такой партии нечего.
 */
export function batchStatusFor(
  items: readonly IngestItemState[],
): MusicIngestBatchStatus {
  if (items.length === 0) return 'draft';
  if (items.some((item) => item.status === 'waiting' || item.status === 'fetching'))
    return 'running';
  if (items.some((item) => item.status === 'stored')) return 'ready';
  return 'failed';
}

export interface IngestStaleCheck {
  status: MusicIngestItemStatus;
  updatedAt: Date;
}

/**
 * Позиция, взятая в работу и с тех пор молчащая. Только `fetching`:
 * `waiting` никем не занята, и «зависнуть» ей не в чем.
 */
export function isItemStale(item: IngestStaleCheck, now: Date): boolean {
  if (item.status !== 'fetching') return false;
  return now.getTime() - item.updatedAt.getTime() >= INGEST_STALE_MS;
}
