"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import type { WorkArchiveDto, WorkArchiveView } from "@vedamatch/shared";
import { getWorkBoardArchive, restoreWorkTask } from "@/lib/work-api";
import { archiveDateLabel, archivePlaceLabel } from "./archive-labels";

const TABS: Array<{ view: WorkArchiveView; label: string }> = [
  { view: "done", label: "Выполненные" },
  { view: "removed", label: "Убранные с доски" },
];

/**
 * Архив доски (VED-61). Выполненное раньше копилось в колонке с галочкой, а
 * убранная кнопкой «в архив» карточка пропадала бесследно — ни посмотреть,
 * ни вернуть. Здесь видно и то, и другое, свежее первым.
 *
 * Карточку открывает то же окно задачи, что и на доске: из архива в неё
 * заходят за подробностями, а не за другим видом той же карточки.
 */
export function WorkArchivePanel({
  boardId,
  canEdit,
  covered,
  onOpenTask,
  onRestored,
  onClose,
}: {
  boardId: string;
  canEdit: boolean;
  /** Поверх открыта карточка: Escape закрывает её, а не архив под ней. */
  covered: boolean;
  onOpenTask: (taskId: string) => void;
  /** Карточка вернулась на доску — доске пора перечитаться. */
  onRestored: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<WorkArchiveView>("done");
  const [archive, setArchive] = useState<WorkArchiveDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    (next: WorkArchiveView) =>
      getWorkBoardArchive(boardId, next)
        .then((result) => {
          setArchive(result);
          setError(null);
        })
        .catch(() => setError("Архив не открылся — попробуйте ещё раз")),
    [boardId],
  );

  // Пока поверх открыта карточка, список не перечитываем: из карточки её
  // возвращают на доску и стирают насовсем, и к закрытию окна архив под ним
  // успевает устареть — поэтому читаем заново, как только он снова открыт.
  useEffect(() => {
    if (!covered) void load(view);
  }, [covered, load, view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !covered) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [covered, onClose]);

  async function restore(taskId: string) {
    setBusyId(taskId);
    try {
      await restoreWorkTask(taskId);
      onRestored();
      await load(view);
    } catch {
      setError("Не удалось вернуть карточку");
    } finally {
      setBusyId(null);
    }
  }

  const items = archive?.view === view ? archive.items : null;
  const tabLabel = TABS.find((tab) => tab.view === view)?.label;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="work-archive-title"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-sheet p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <h2
            id="work-archive-title"
            className="font-display text-lg font-bold text-text-0"
          >
            Архив доски
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть архив"
            className="ml-auto rounded-lg p-1.5 text-text-2 hover:text-text-0"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Что показать"
          className="mb-3 flex gap-2"
        >
          {TABS.map((tab) => (
            <button
              key={tab.view}
              type="button"
              role="tab"
              aria-selected={view === tab.view}
              onClick={() => setView(tab.view)}
              className="rounded-full border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0 aria-selected:border-cyan aria-selected:text-text-0"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-3 text-sm text-magenta">
            {error}
          </p>
        )}

        {!items ? (
          <p className="flex items-center gap-2 text-sm text-text-2">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Открываем архив…
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-2">
            {view === "done"
              ? "Выполненных задач пока нет. Задача становится выполненной, когда её переносят в раздел с галочкой."
              : "С доски ничего не убирали."}
          </p>
        ) : (
          <ul className="space-y-2" aria-label={tabLabel}>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-xl border border-glass-brd bg-bg-1 p-2"
              >
                <button
                  type="button"
                  onClick={() => onOpenTask(item.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-sm text-text-0">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-2">
                    <span className="font-mono">{item.key}</span>
                    {" · "}
                    {archiveDateLabel(item, view)}
                    {" · "}
                    {archivePlaceLabel(item)}
                    {item.assignee ? ` · ${item.assignee.name}` : ""}
                  </span>
                </button>
                {canEdit && item.archivedAt && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void restore(item.id)}
                    aria-label={`Вернуть на доску: ${item.title}`}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-glass-brd px-2 py-1.5 text-xs text-text-1 hover:text-text-0 disabled:opacity-50"
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Вернуть
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {archive?.hasMore && items && (
          <p className="mt-3 text-xs text-text-2">
            Показаны последние {items.length}.
          </p>
        )}
      </div>
    </div>
  );
}
