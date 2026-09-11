import { normalizeTaskTitle, titleToSave } from "./task-title";

/**
 * Правка названия и описания в окне задачи (VED-56).
 *
 * Раньше поле сохранялось само, когда теряло фокус: человек не видел, дошло
 * ли, а закрытие окна клавишей Escape прямо из поля правку теряло — фокус не
 * уходил, и сохранять было нечему. Теперь правки копятся черновиком, а
 * сохраняет их кнопка «Сохранить» или закрытие окна.
 */

export interface TaskText {
  title: string;
  description: string;
}

/** Есть ли несохранённые правки — от этого зависит, видна ли кнопка. */
export function hasTaskEdits(saved: TaskText, draft: TaskText): boolean {
  return (
    normalizeTaskTitle(draft.title) !== saved.title ||
    draft.description !== saved.description
  );
}

/**
 * Почему сохранить нельзя. Пустое название не сохраняется никогда: карточку
 * без названия не найти ни на доске, ни в поиске.
 */
export function taskEditsProblem(draft: TaskText): string | null {
  return normalizeTaskTitle(draft.title)
    ? null
    : "Название не может быть пустым";
}

/**
 * Что отправить на сервер; `null` — нечего. Пустое название отбрасывается,
 * описание при этом всё равно сохраняется: закрытие окна не должно терять
 * одно из-за другого.
 */
export function pendingTaskEdits(
  saved: TaskText,
  draft: TaskText,
): Partial<TaskText> | null {
  const body: Partial<TaskText> = {};
  const title = titleToSave(draft.title, saved.title);
  if (title) body.title = title;
  if (draft.description !== saved.description)
    body.description = draft.description;
  return Object.keys(body).length > 0 ? body : null;
}
