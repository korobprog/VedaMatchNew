import type { WorkTaskCardDto } from "@vedamatch/shared";

/**
 * Группировка карточек раздела по сроку (VED-160).
 *
 * Тот же приём, что у важности (task-grouping.ts): вид, а не порядок —
 * позиции карточек не трогаются, режим живёт на устройстве
 * (см. task-view-mode.ts) и не перестраивает раздел соседу.
 *
 * Границы дня считаются по местному времени человека, не по UTC и не по
 * серверу: `dueAt` хранится в ISO с зоной, но «сегодня» у человека в
 * Красноярске и на сервере в Амстердаме — разные сутки. Функция получает
 * `now` параметром, а не читает `Date.now()` сама — тестируемость и
 * детерминированность, как у соседних сервисов (`notice-expiry.ts`).
 */

/** Сверху горящее, снизу — то, что торопиться не заставляет. «Без срока» —
 *  всегда последней группой, независимо от порядка остальных. */
const BUCKET_ORDER = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "none",
] as const;

export type DueBucket = (typeof BUCKET_ORDER)[number];

const BUCKET_TITLE: Record<DueBucket, string> = {
  overdue: "Просрочено",
  today: "Сегодня",
  tomorrow: "Завтра",
  // Не «На этой неделе»: бакет — скользящее окно 2–7 дней от текущего
  // момента, а не календарная неделя до воскресенья (понедельничная задача
  // «через 7 дней» календарно уже следующая неделя). «Ближайшая неделя» не
  // обещает границы по календарю.
  week: "Ближайшая неделя",
  later: "Позже",
  none: "Без срока",
};

export interface DueGroup<T> {
  bucket: DueBucket;
  title: string;
  tasks: T[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Полночь того же местного дня, что и `date`. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function bucketOf(dueAt: string | null, todayStart: Date): DueBucket {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  const diffDays = Math.round(
    (startOfLocalDay(due).getTime() - todayStart.getTime()) / DAY_MS,
  );
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "week";
  return "later";
}

/**
 * Разложить карточки по сроку. Внутри группы — по возрастанию `dueAt`, кроме
 * «Без срока»: там порядок остаётся таким, каким его выстроили руками на
 * доске, — сравнивать в этой группе нечего.
 *
 * Пустые группы не возвращаются: то же правило, что у важности.
 */
export function groupTasksByDueDate<
  T extends Pick<WorkTaskCardDto, "dueAt">,
>(tasks: readonly T[], now: Date): DueGroup<T>[] {
  const todayStart = startOfLocalDay(now);
  const byBucket = new Map<DueBucket, T[]>(
    BUCKET_ORDER.map((bucket) => [bucket, []]),
  );
  for (const task of tasks) {
    byBucket.get(bucketOf(task.dueAt, todayStart))!.push(task);
  }
  for (const bucket of BUCKET_ORDER) {
    if (bucket === "none") continue;
    byBucket
      .get(bucket)!
      .sort(
        (a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime(),
      );
  }
  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    title: BUCKET_TITLE[bucket],
    tasks: byBucket.get(bucket)!,
  })).filter((group) => group.tasks.length > 0);
}
