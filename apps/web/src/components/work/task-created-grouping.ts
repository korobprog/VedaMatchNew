import type { WorkTaskCardDto } from "@vedamatch/shared";

/**
 * Группировка карточек раздела по дате создания (VED-160, круг 3).
 *
 * Первая версия «По дате» группировала по сроку (`dueAt`) — просроченное и
 * ближайшее сверху. Тестировщик ждал другое: свежесозданные задачи сверху,
 * как в открытой ленте, а срок тут ни при чём. Режим группировки по сроку
 * убран целиком (вместе с `task-due-grouping.ts`) — оставлять рядом два
 * непохожих смысла под одной кнопкой «По дате» только путало бы.
 *
 * Тот же приём, что у важности (task-grouping.ts): вид, а не порядок —
 * позиции карточек не трогаются, режим живёт на устройстве
 * (task-view-mode.ts, ключ и раньше назывался «date» — не переименован, ключ
 * хранения для уже сохранивших выбор людей прежний).
 *
 * Границы суток — по местному времени человека, не по UTC: `now` передаётся
 * параметром, а не читается из `Date.now()` внутри чистой функции —
 * тестируемость и детерминированность, тот же приём, что у соседних
 * сервисов (`notice-expiry.ts`).
 */

/** Сверху — самое свежее. «Раньше» — всегда последней группой. */
const BUCKET_ORDER = ["today", "yesterday", "week", "earlier"] as const;

export type CreatedBucket = (typeof BUCKET_ORDER)[number];

const BUCKET_TITLE: Record<CreatedBucket, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  week: "На этой неделе",
  earlier: "Раньше",
};

export interface CreatedGroup<T> {
  bucket: CreatedBucket;
  title: string;
  tasks: T[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Полночь того же местного дня, что и `date`. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function bucketOf(createdAt: string, todayStart: Date): CreatedBucket {
  const created = new Date(createdAt);
  // Битая дата (не должна прилетать с сервера, но проверка дешевле, чем
  // разбирающийся с NaN интерфейс) уходит в самую дальнюю группу — так она
  // хотя бы не всплывает наверх среди свежих.
  if (Number.isNaN(created.getTime())) return "earlier";
  const diffDays = Math.round(
    (todayStart.getTime() - startOfLocalDay(created).getTime()) / DAY_MS,
  );
  // Рассинхрон часов на клиенте/сервере может дать отрицательную разницу —
  // «создано в будущем» читаем как «сегодня», а не заводим отдельный бакет.
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 6) return "week";
  return "earlier";
}

/**
 * Разложить карточки по дате создания. Группы идут от самой свежей к самой
 * старой, и внутри группы — по убыванию `createdAt`: самая новая задача
 * первой.
 *
 * Пустые группы не возвращаются: то же правило, что у важности и было у
 * группировки по сроку.
 */
export function groupTasksByCreatedDate<
  T extends Pick<WorkTaskCardDto, "createdAt">,
>(tasks: readonly T[], now: Date): CreatedGroup<T>[] {
  const todayStart = startOfLocalDay(now);
  const byBucket = new Map<CreatedBucket, T[]>(
    BUCKET_ORDER.map((bucket) => [bucket, []]),
  );
  for (const task of tasks) {
    byBucket.get(bucketOf(task.createdAt, todayStart))!.push(task);
  }
  for (const bucket of BUCKET_ORDER) {
    byBucket
      .get(bucket)!
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }
  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    title: BUCKET_TITLE[bucket],
    tasks: byBucket.get(bucket)!,
  })).filter((group) => group.tasks.length > 0);
}
