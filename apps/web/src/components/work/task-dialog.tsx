"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import type {
  WorkBoardDto,
  WorkTaskDto,
  WorkTaskPriority,
} from "@vedamatch/shared";
import {
  addWorkChecklistItem,
  archiveWorkTask,
  commentWorkTask,
  getWorkTask,
  moveWorkTask,
  removeWorkChecklistItem,
  updateWorkChecklistItem,
  updateWorkTask,
} from "@/lib/work-api";

const PRIORITY_TITLE: Record<WorkTaskPriority, string> = {
  low: "Не горит",
  normal: "Обычная",
  high: "Важная",
  urgent: "Срочно",
};

/** `datetime-local` понимает только местное время без зоны. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Карточка целиком: описание, срок, исполнитель, чек-лист и обсуждение.
 * Открывается окном, а не разворачивается на доске: доска — про состояние, а
 * карточка — про подробности, и мешать их в одном экране значит потерять оба.
 */
export function WorkTaskDialog({
  taskId,
  board,
  onClose,
  onChanged,
}: {
  taskId: string;
  board: WorkBoardDto;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [task, setTask] = useState<WorkTaskDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [checklistDraft, setChecklistDraft] = useState("");

  const canEdit =
    board.role === "owner" || board.role === "admin" || board.role === "member";

  // Ответ применяется только пока карточка открыта: закрыли её и открыли
  // соседнюю — прилетевший ответ первой не должен подменить вторую.
  useEffect(() => {
    let alive = true;
    getWorkTask(taskId)
      .then((loaded) => {
        if (alive) setTask(loaded);
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(
            cause instanceof Error ? cause.message : "Не удалось открыть",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [taskId]);

  // Escape закрывает окно: без этого на компьютере из карточки выходят мышью,
  // а с клавиатуры — никак.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function patch(body: Parameters<typeof updateWorkTask>[1]) {
    try {
      setTask(await updateWorkTask(taskId, body));
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не сохранилось");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={task ? task.title : "Задача"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-sheet p-4 sm:rounded-2xl">
        {!task ? (
          <p className="flex items-center gap-2 text-sm text-text-2">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Открываем карточку…
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-start gap-2">
              <span className="mt-1 font-mono text-xs text-text-2">
                {task.key}
              </span>
              <input
                defaultValue={task.title}
                readOnly={!canEdit}
                maxLength={200}
                aria-label="Название задачи"
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (canEdit && value && value !== task.title) {
                    void patch({ title: value });
                  }
                }}
                className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 font-display text-lg font-bold text-text-0"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="rounded-lg p-1 text-text-1"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>

            {error && (
              <p role="alert" className="mb-3 text-sm text-magenta">
                {error}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-text-1">
                Колонка
                <select
                  value={task.columnId}
                  disabled={!canEdit}
                  onChange={async (event) => {
                    // Смена колонки из карточки — тот же перенос, что и
                    // перетаскиванием: клавиатуре нужен свой путь.
                    setTask(
                      await moveWorkTask(task.id, {
                        columnId: event.target.value,
                      }),
                    );
                    await onChanged();
                  }}
                  className="mt-1 block w-full rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
                >
                  {board.columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-text-1">
                Исполнитель
                <select
                  value={task.assignee?.userId ?? ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    patch({ assigneeId: event.target.value || null })
                  }
                  className="mt-1 block w-full rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
                >
                  <option value="">Никто</option>
                  {board.members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-text-1">
                Важность
                <select
                  value={task.priority}
                  disabled={!canEdit}
                  onChange={(event) =>
                    patch({ priority: event.target.value as WorkTaskPriority })
                  }
                  className="mt-1 block w-full rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
                >
                  {Object.entries(PRIORITY_TITLE).map(([value, title]) => (
                    <option key={value} value={value}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-3 block text-sm text-text-1">
              Срок
              <input
                type="datetime-local"
                defaultValue={toLocalInput(task.dueAt)}
                disabled={!canEdit}
                onChange={(event) =>
                  patch({
                    dueAt: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : null,
                  })
                }
                className="mt-1 block rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
              />
            </label>

            <label className="mt-3 block text-sm text-text-1">
              Описание
              <textarea
                defaultValue={task.description}
                readOnly={!canEdit}
                rows={4}
                maxLength={10000}
                placeholder="Что именно нужно сделать и что считать готовым"
                onBlur={(event) => {
                  if (canEdit && event.target.value !== task.description) {
                    void patch({ description: event.target.value });
                  }
                }}
                className="mt-1 block w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              />
            </label>

            <h3 className="mt-5 text-sm font-semibold text-text-0">
              Чек-лист{" "}
              {task.checklistTotal > 0 && (
                <span className="font-normal text-text-2">
                  {task.checklistDone} из {task.checklistTotal}
                </span>
              )}
            </h3>
            <ul className="mt-2 space-y-1">
              {task.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={!canEdit}
                    id={`check-${item.id}`}
                    onChange={async (event) => {
                      setTask(
                        await updateWorkChecklistItem(item.id, {
                          done: event.target.checked,
                        }),
                      );
                      await onChanged();
                    }}
                  />
                  <label
                    htmlFor={`check-${item.id}`}
                    className={`flex-1 text-sm ${
                      item.done ? "text-text-2 line-through" : "text-text-0"
                    }`}
                  >
                    {item.text}
                  </label>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Убрать пункт «${item.text}»`}
                      onClick={async () => {
                        setTask(await removeWorkChecklistItem(item.id));
                        await onChanged();
                      }}
                      className="text-text-2 hover:text-magenta"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!checklistDraft.trim()) return;
                  setTask(
                    await addWorkChecklistItem(task.id, {
                      text: checklistDraft.trim(),
                    }),
                  );
                  setChecklistDraft("");
                  await onChanged();
                }}
              >
                <input
                  value={checklistDraft}
                  onChange={(event) => setChecklistDraft(event.target.value)}
                  maxLength={200}
                  placeholder="Добавить пункт"
                  aria-label="Новый пункт чек-листа"
                  className="min-w-0 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-glass px-3 py-2 text-sm text-text-0"
                >
                  Добавить
                </button>
              </form>
            )}

            <h3 className="mt-5 text-sm font-semibold text-text-0">
              Обсуждение
            </h3>
            <ul className="mt-2 space-y-3">
              {task.comments.map((entry) => (
                <li key={entry.id}>
                  <p className="text-xs text-text-2">
                    {entry.author?.name ?? "Удалённый участник"} ·{" "}
                    {new Date(entry.createdAt).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-text-0">
                    {entry.body}
                  </p>
                </li>
              ))}
            </ul>
            {canEdit && (
              <form
                className="mt-3 flex gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!comment.trim()) return;
                  setTask(
                    await commentWorkTask(task.id, { body: comment.trim() }),
                  );
                  setComment("");
                  await onChanged();
                }}
              >
                <input
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={4000}
                  placeholder="Написать"
                  aria-label="Новый комментарий"
                  className="min-w-0 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white"
                >
                  Отправить
                </button>
              </form>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  await archiveWorkTask(task.id);
                  await onChanged();
                  onClose();
                }}
                className="mt-6 text-sm text-magenta"
              >
                Убрать карточку в архив
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
