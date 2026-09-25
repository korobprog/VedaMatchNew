import type { WorkTaskCardDto } from "@vedamatch/shared";

/**
 * Вид «Последние» (VED-485): задачи, которые смотрящий открывал или с
 * которыми работал, одним списком — свежие сверху. Чужие не входят:
 * заказчик просил «чужие не включать».
 *
 * Список по доске целиком, а не по разделам: «последние» — про время, а не
 * про тему, и разложенные по разделам они перестали бы быть одним рядом.
 */
export function recentTasks<
  Task extends Pick<WorkTaskCardDto, "id" | "foreign" | "touchedAt">,
>(columns: ReadonlyArray<{ tasks: readonly Task[] }>, limit = 100): Task[] {
  return columns
    .flatMap((column) => column.tasks)
    .filter((task) => !task.foreign && task.touchedAt)
    .sort(
      (a, b) =>
        Date.parse(b.touchedAt as string) - Date.parse(a.touchedAt as string) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
