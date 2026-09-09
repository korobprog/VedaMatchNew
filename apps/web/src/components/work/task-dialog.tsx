"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2, X } from "lucide-react";
import type {
  WorkBoardDto,
  WorkTaskDto,
  WorkTaskPriority,
} from "@vedamatch/shared";
import {
  addWorkChecklistItem,
  archiveWorkTask,
  attachWorkFile,
  removeWorkAttachment,
  commentWorkTask,
  getWorkTask,
  moveWorkTask,
  removeWorkChecklistItem,
  updateWorkChecklistItem,
  updateWorkTask,
} from "@/lib/work-api";
import { dueFromInput, dueToInput } from "./task-due";
import { PRIORITY_TITLE } from "./task-priority";

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
  const [busy, setBusy] = useState(false);
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

  /**
   * Любое действие карточки идёт через одну обёртку.
   *
   * Раньше ошибку показывала только правка полей, а отправка комментария,
   * чек-лист, перенос и архив падали молча: отказ сервера (истёкшая сессия,
   * лимит запросов, потерянные права) выглядел как «кнопка не нажимается».
   * Заодно `busy` не даёт отправить второй раз, пока летит первый.
   */
  async function run(action: () => Promise<WorkTaskDto | void>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setTask(next);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не сохранилось");
    } finally {
      setBusy(false);
    }
  }

  function patch(body: Parameters<typeof updateWorkTask>[1]) {
    void run(() => updateWorkTask(taskId, body));
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
                  onChange={(event) => {
                    // Смена колонки из карточки — тот же перенос, что и
                    // перетаскиванием: клавиатуре нужен свой путь.
                    const columnId = event.target.value;
                    void run(() => moveWorkTask(task.id, { columnId }));
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

            {/* Кто исполняет — выше, в поле; кто поставил — здесь, рядом со
                сроком. Постановщика не выбирают: это тот, кто завёл карточку,
                и подменять его задним числом значит переписывать, с кого
                спрашивать. */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="text-sm text-text-1">
                Задачу поставил
                <p className="mt-1 truncate rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0">
                  {task.createdBy?.name ?? "Неизвестно"}
                </p>
              </div>

              <label className="text-sm text-text-1">
                Срок
                <input
                  type="datetime-local"
                  defaultValue={dueToInput(task.dueAt)}
                  disabled={!canEdit}
                  onChange={(event) => {
                    const dueAt = dueFromInput(event.target.value);
                    // undefined — поле ещё недописано: такое не сохраняем.
                    if (dueAt !== undefined) patch({ dueAt });
                  }}
                  className="mt-1 block w-full rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
                />
              </label>
            </div>

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
                    onChange={(event) => {
                      const done = event.target.checked;
                      void run(() =>
                        updateWorkChecklistItem(item.id, { done }),
                      );
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
                      disabled={busy}
                      onClick={() =>
                        void run(() => removeWorkChecklistItem(item.id))
                      }
                      className="text-text-2 hover:text-magenta disabled:opacity-50"
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
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = checklistDraft.trim();
                  if (!text) return;
                  void run(async () => {
                    const next = await addWorkChecklistItem(task.id, { text });
                    setChecklistDraft("");
                    return next;
                  });
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
                  disabled={busy || !checklistDraft.trim()}
                  className="rounded-xl bg-glass px-3 py-2 text-sm text-text-0 disabled:opacity-50"
                >
                  Добавить
                </button>
              </form>
            )}

            <h3 className="mt-5 text-sm font-semibold text-text-0">
              Вложения{" "}
              {task.attachments.length > 0 && (
                <span className="font-normal text-text-2">
                  {task.attachments.length}
                </span>
              )}
            </h3>

            {/* Картинки сеткой, документы строкой: скриншот узнают по самому
                скриншоту, а смету — по имени файла, и показывать её серым
                квадратом-заглушкой значило бы занимать место ничем. */}
            {task.attachments.length > 0 && (
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {task.attachments
                  .filter((file) => file.mime.startsWith("image/"))
                  .map((file) => (
                    <li key={file.id} className="group relative">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-xl border border-glass-brd"
                      >
                        {/* Ссылка подписана и живёт шесть часов — next/image
                            не годится для адреса, который меняется. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={file.url}
                          alt={file.name}
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                      </a>
                      {canEdit && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(() => removeWorkAttachment(file.id))
                          }
                          aria-label={`Убрать вложение «${file.name}»`}
                          className="absolute right-1 top-1 rounded-lg bg-bg-0/80 p-1 text-text-1 hover:text-text-0 disabled:opacity-50"
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}

            <ul className="mt-2 space-y-1">
              {task.attachments
                .filter((file) => !file.mime.startsWith("image/"))
                .map((file) => (
                  <li key={file.id} className="flex items-center gap-2">
                    <FileText aria-hidden className="size-4 shrink-0 text-text-2" />
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm text-text-1 hover:text-text-0"
                    >
                      {file.name}
                    </a>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() => removeWorkAttachment(file.id))
                        }
                        aria-label={`Убрать вложение «${file.name}»`}
                        className="rounded-lg p-1 text-text-2 hover:text-text-0 disabled:opacity-50"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
            </ul>

            {canEdit && (
              // Подпись поверх спрятанного input: системная кнопка «Выберите
              // файл» не переживает тему портала и говорит «файл не выбран»
              // там, где выбирать нечего.
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-glass px-3 py-2 text-sm text-text-0">
                <Paperclip aria-hidden className="size-4" />
                Прикрепить картинку или файл
                <input
                  type="file"
                  className="sr-only"
                  disabled={busy}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Поле очищается сразу: иначе тот же файл, выбранный
                    // второй раз, не поднимет change и молча не приложится.
                    event.target.value = "";
                    if (file) void run(() => attachWorkFile(task.id, file));
                  }}
                />
              </label>
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
                onSubmit={(event) => {
                  event.preventDefault();
                  const body = comment.trim();
                  if (!body) return;
                  void run(async () => {
                    const next = await commentWorkTask(task.id, { body });
                    setComment("");
                    return next;
                  });
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
                  disabled={busy || !comment.trim()}
                  className="rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Отправить
                </button>
              </form>
            )}

            {canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await archiveWorkTask(task.id);
                    onClose();
                  })
                }
                className="mt-6 text-sm text-magenta disabled:opacity-50"
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
