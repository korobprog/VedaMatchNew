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
 * Позиции, которые ещё в работе. Пока они есть, партия не досчитана: ни
 * статус, ни публикация про неё правды не скажут.
 */
export function inFlightCount(items: readonly IngestItemState[]): number {
  return items.filter(
    (item) => item.status === 'waiting' || item.status === 'fetching',
  ).length;
}

/**
 * Статус партии по её позициям.
 *
 * `ready` — доставлено хоть что-то и никто больше не в работе: дальше
 * человек правит метаданные и публикует. `failed` — работа кончилась, но не
 * появилось ни одной новой записи; пропуск дублей сюда тоже попадает, потому
 * что публиковать в такой партии нечего.
 *
 * `current` — статус, который у партии уже стоит. Нужен ради единственного
 * правила: **`published` поглощает**. Опубликованная партия отдала записи в
 * каталог, и доехавший следом остаток не имеет права открыть её заново —
 * иначе «Опубликовать всё» нажимается второй раз и собирает вторую системную
 * подборку с тем же названием. Правило живёт здесь одно на всех: проверка,
 * размноженная по каждому `refreshStatus`, однажды забудется в одном из них.
 */
export function batchStatusFor(
  items: readonly IngestItemState[],
  current?: MusicIngestBatchStatus,
): MusicIngestBatchStatus {
  if (current === 'published') return 'published';
  if (items.length === 0) return 'draft';
  if (inFlightCount(items) > 0) return 'running';
  if (items.some((item) => item.status === 'stored')) return 'ready';
  return 'failed';
}

/**
 * Почему публиковать рано — словами, которые админ прочитает в ответе.
 *
 * Строка собирается здесь, рядом со счётчиком: публикация партии, в которой
 * ещё идёт приём, — ловушка. Остаток доедет, но опубликовать его будет уже
 * нельзя: партия закрыта.
 */
export function ingestInFlightReason(count: number): string {
  return `Дождитесь окончания приёма: ещё ${count} ${pluralItems(count)} в работе`;
}

/** «1 позиция», «3 позиции», «18 позиций», и отдельно 11..14 — как «много». */
function pluralItems(count: number): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'позиций';
  if (mod10 === 1) return 'позиция';
  if (mod10 >= 2 && mod10 <= 4) return 'позиции';
  return 'позиций';
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
