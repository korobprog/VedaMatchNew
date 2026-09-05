"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  GripVertical,
  CornerUpRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { LibraryCategoryTreeNode, LibraryLocale } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { categoryCountLabel, pickLocalized, t } from "./i18n";
import { CategoryEditForm } from "./category-edit-form";
import {
  applyMove,
  categoryCounter,
  flattenTree,
  forbiddenTargets,
  isNoopMove,
  projectDrop,
  removeFromTree,
  renameInTree,
  subtreeIds,
  withoutSubtree,
  type DropTarget,
  type FlatRow,
} from "./category-tree";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Высота строки и шаг отступа в пикселях — по ним считается жест. */
const ROW_HEIGHT = 48;
const INDENT = 24;
/** Порог, за которым нажатие считается перетаскиванием, а не промахом. */
const DRAG_THRESHOLD = 4;
/** Ближе этого к краю экрана список едет сам — иначе длинное дерево не пройти. */
const AUTOSCROLL_EDGE = 72;
const AUTOSCROLL_SPEED = 12;

interface DragState {
  id: string;
  startX: number;
  startY: number;
  startIndex: number;
  startDepth: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

/**
 * Режим «Упорядочить»: дерево рубрик списком, с перетаскиванием.
 *
 * Отдельный режим, а не перетаскивание прямо по чипам просмотра: чип —
 * ссылка, и на одном и том же элементе столкнулись бы три намерения —
 * открыть, переставить рядом, вложить внутрь. Здесь строки не ссылки, и
 * жест однозначен.
 *
 * Вёрстка одна на телефон и на компьютер: список вертикальный, разница
 * только в способе взять строку. Перетаскивание — не единственный путь:
 * WCAG 2.2 (SC 2.5.7) требует альтернативу, ей служат шторка
 * «Переместить в…» и клавиатура.
 */
export function LibraryTreeOrganizer({
  locale,
  initialTree,
}: {
  locale: LibraryLocale;
  initialTree: LibraryCategoryTreeNode[];
}) {
  const router = useRouter();
  // Дерево после монтирования ведёт этот компонент: каждый `move` возвращает
  // с сервера свежую версию целиком. Синхронизировать состояние с пропом
  // эффектом нельзя — он затирал бы оптимистичный показ на полпути.
  const [tree, setTree] = useState(initialTree);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  /* Какую рубрику переименовываем. Карандаш ушёл сюда с плиток верхнего
     уровня: там он занимал место под названием, а завести корневую рубрику
     всё равно может только администрация — то есть тот, у кого этот режим и
     так открыт. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const rows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  /* Свёрнутая ветка выпадает из `rows`, а переименование могло начаться до
     сворачивания — ищем по дереву, а не по видимым строкам. */
  const renamingRow = useMemo(
    () =>
      renaming
        ? (flattenTree(tree).find((row) => row.id === renaming) ?? null)
        : null,
    [renaming, tree],
  );

  const target: DropTarget | null = useMemo(() => {
    if (!drag?.moved) return null;
    const rest = withoutSubtree(rows, drag.id);
    const shift = Math.round(drag.offsetY / ROW_HEIGHT);
    const removedBefore = rows
      .slice(0, drag.startIndex)
      .filter((row) => !rest.some((item) => item.id === row.id)).length;
    const overIndex = drag.startIndex - removedBefore + shift;
    const desiredDepth = drag.startDepth + Math.round(drag.offsetX / INDENT);
    return projectDrop(rows, drag.id, overIndex, desiredDepth);
  }, [drag, rows]);

  const commit = useCallback(
    async (id: string, next: DropTarget, silent = false) => {
      if (isNoopMove(rows, id, next)) return;

      const previousTree = tree;
      const undo = whereItWas(rows, id);
      setTree(applyMove(tree, id, next));

      try {
        const res = await apiFetch(`${API_URL}/library/categories/${id}/move`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentId: next.parentId,
            beforeId: next.beforeId,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          setTree(previousTree);
          setNotice({ kind: "error", message: moveError(locale, body?.message) });
          return;
        }
        setTree((await res.json()) as LibraryCategoryTreeNode[]);
        setNotice(silent ? null : { kind: "done", id, undo });
        router.refresh();
      } catch {
        setTree(previousTree);
        setNotice({ kind: "error", message: t(locale, "tree.moveFailed") });
      }
    },
    [locale, router, rows, tree],
  );

  /**
   * Удаление рубрики.
   *
   * Спрашиваем в той же полосе внизу, что и «Отменить» у перемещения, а не
   * в строке дерева: строки здесь ровно по 48 пикселей, по ним считается
   * жест перетаскивания, и раскрывающийся вопрос посреди списка сбил бы
   * прицел у соседних.
   *
   * Оптимистично не удаляем: отказ сервера здесь — обычное дело («внутри
   * есть вложенные», «есть материалы»), и исчезнувшая на секунду рубрика
   * пугала бы зря.
   */
  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`${API_URL}/library/categories/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          setNotice({
            kind: "error",
            message: deleteError(locale, body?.message),
          });
          return;
        }
        setTree((current) => removeFromTree(current, id));
        setNotice({ kind: "message", message: t(locale, "category.deleteDone") });
        router.refresh();
      } catch {
        setNotice({ kind: "error", message: t(locale, "category.deleteFailed") });
      }
    },
    [locale, router],
  );

  // Указатель ведём на документе: палец легко уходит за пределы строки, а с
  // pointer capture на ручке событие продолжает приходить ей.
  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const offsetX = event.clientX - drag.startX;
      const offsetY = event.clientY - drag.startY;
      const moved =
        drag.moved ||
        Math.abs(offsetX) > DRAG_THRESHOLD ||
        Math.abs(offsetY) > DRAG_THRESHOLD;
      setDrag((current) =>
        current ? { ...current, offsetX, offsetY, moved } : current,
      );

      const fromTop = event.clientY;
      const fromBottom = window.innerHeight - event.clientY;
      if (fromTop < AUTOSCROLL_EDGE) window.scrollBy(0, -AUTOSCROLL_SPEED);
      else if (fromBottom < AUTOSCROLL_EDGE) window.scrollBy(0, AUTOSCROLL_SPEED);
    };

    const onUp = () => {
      setDrag(null);
      if (drag.moved && target) void commit(drag.id, target);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [commit, drag, target]);

  function startDrag(event: React.PointerEvent, row: FlatRow, index: number) {
    if (!row.node.canMove || event.button > 0) return;
    event.preventDefault();
    setDrag({
      id: row.id,
      startX: event.clientX,
      startY: event.clientY,
      startIndex: index,
      startDepth: row.depth,
      offsetX: 0,
      offsetY: 0,
      moved: false,
    });
  }

  /**
   * Клавиатурный эквивалент жеста. `Tab` намеренно не занят: он уводит
   * фокус, и перехват сломал бы навигацию по странице.
   */
  function onKeyDown(event: React.KeyboardEvent, row: FlatRow) {
    if (!row.node.canMove || !event.ctrlKey) return;

    const siblings = rows.filter((item) => item.parentId === row.parentId);
    const at = siblings.findIndex((item) => item.id === row.id);

    if (event.key === "ArrowUp" && at > 0) {
      event.preventDefault();
      void commit(row.id, {
        parentId: row.parentId,
        beforeId: siblings[at - 1].id,
        depth: row.depth,
      });
      return;
    }
    if (event.key === "ArrowDown" && at < siblings.length - 1) {
      event.preventDefault();
      void commit(row.id, {
        parentId: row.parentId,
        beforeId: siblings[at + 2]?.id ?? null,
        depth: row.depth,
      });
      return;
    }
    if (event.key === "ArrowRight" && at > 0) {
      // Вкладываем в соседа сверху — единственного, кто может стать родителем
      // без разрыва порядка.
      event.preventDefault();
      const into = siblings[at - 1];
      if (forbiddenTargets(rows, row.id).has(into.id)) return;
      void commit(row.id, {
        parentId: into.id,
        beforeId: null,
        depth: row.depth + 1,
      });
      return;
    }
    if (event.key === "ArrowLeft" && row.parentId) {
      event.preventDefault();
      const parent = rows.find((item) => item.id === row.parentId)!;
      const uncles = rows.filter((item) => item.parentId === parent.parentId);
      const parentAt = uncles.findIndex((item) => item.id === parent.id);
      void commit(row.id, {
        parentId: parent.parentId,
        beforeId: uncles[parentAt + 1]?.id ?? null,
        depth: parent.depth,
      });
    }
  }

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        {t(locale, "tree.empty")}
      </p>
    );
  }

  const dragged = drag?.moved ? new Set(subtreeIds(rows, drag.id)) : null;

  return (
    <div className="mb-6">
      <p className="mb-2 text-sm text-text-2">{t(locale, "tree.hint")}</p>
      <p className="mb-3 text-xs text-text-2">{t(locale, "tree.keyboardHint")}</p>

      <ul
        role="tree"
        aria-label={t(locale, "nav.sections")}
        className="glass relative rounded-2xl border border-glass-brd p-2"
      >
        {rows.map((row, index) => {
          const siblings = rows.filter((item) => item.parentId === row.parentId);
          const showLineBefore =
            target !== null &&
            drag !== null &&
            insertionIndex(rows, drag.id, target) === index;

          return (
            // aria-selected обязателен у treeitem, хотя выделения здесь нет:
            // строки только переставляют, ничего не «выбирая».
            <li
              key={row.id}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-posinset={siblings.findIndex((item) => item.id === row.id) + 1}
              aria-setsize={siblings.length}
              aria-expanded={
                row.node.childrenCount > 0 ? !collapsed.has(row.id) : undefined
              }
              aria-selected={false}
              tabIndex={0}
              onKeyDown={(event) => onKeyDown(event, row)}
              style={{ marginInlineStart: row.depth * INDENT }}
              className={`relative flex h-12 items-center gap-2 rounded-xl px-2 ${
                dragged?.has(row.id) ? "opacity-40" : ""
              }`}
            >
              {showLineBefore && (
                <InsertionLine offset={(target.depth - row.depth) * INDENT} />
              )}

              <span
                role="button"
                tabIndex={-1}
                aria-label={t(locale, "tree.drag")}
                onPointerDown={(event) => startDrag(event, row, index)}
                className={`grid h-11 w-8 shrink-0 place-items-center text-text-2 ${
                  row.node.canMove ? "cursor-grab touch-none" : "opacity-30"
                }`}
              >
                <GripVertical aria-hidden className="h-4 w-4" />
              </span>

              {row.node.childrenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  aria-label={t(
                    locale,
                    collapsed.has(row.id) ? "tree.expand" : "tree.collapse",
                  )}
                  className="grid h-8 w-6 shrink-0 place-items-center text-text-2 hover:text-text-0"
                >
                  <ChevronRight
                    aria-hidden
                    className={`h-4 w-4 transition-transform ${
                      collapsed.has(row.id) ? "" : "rotate-90"
                    }`}
                  />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}

              <span className="min-w-0 flex-1 truncate py-3 text-sm text-text-0">
                {pickLocalized(locale, {
                  ru: row.node.titleRu,
                  en: row.node.titleEn,
                })}
              </span>

              {/* То же правило, что и в полосе рубрик: строка показывает
                  то, что лежит прямо в ней. Иначе в упорядочивании число у
                  родителя менялось бы при переносе чужого материала между
                  его подразделами — и выглядело бы как сбой. */}
              <span
                aria-label={categoryCountLabel(locale, row.node)}
                title={categoryCountLabel(locale, row.node)}
                className="shrink-0 font-mono text-xs text-text-2"
              >
                {categoryCounter(row.node).value}
              </span>

              {row.node.canEdit && (
                <button
                  type="button"
                  onClick={() => setRenaming(row.id)}
                  aria-label={`${t(locale, "category.edit")}: ${pickLocalized(
                    locale,
                    { ru: row.node.titleRu, en: row.node.titleEn },
                  )}`}
                  className="grid h-11 w-9 shrink-0 place-items-center text-text-2 hover:text-text-0"
                >
                  <Pencil aria-hidden className="h-4 w-4" />
                </button>
              )}

              {row.node.canMove && (
                <button
                  type="button"
                  onClick={() => setPicking(row.id)}
                  aria-label={t(locale, "tree.moveTo")}
                  className="grid h-11 w-9 shrink-0 place-items-center text-text-2 hover:text-text-0"
                >
                  <CornerUpRight aria-hidden className="h-4 w-4" />
                </button>
              )}

              {row.node.canDelete && (
                <button
                  type="button"
                  onClick={() => setNotice({ kind: "confirm", id: row.id })}
                  aria-label={`${t(locale, "category.delete")}: ${pickLocalized(
                    locale,
                    { ru: row.node.titleRu, en: row.node.titleEn },
                  )}`}
                  className="grid h-11 w-9 shrink-0 place-items-center text-text-2 hover:text-magenta"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {picking && (
        <MovePicker
          locale={locale}
          rows={rows}
          activeId={picking}
          onClose={() => setPicking(null)}
          onPick={(parentId) => {
            setPicking(null);
            void commit(picking, { parentId, beforeId: null, depth: 0 });
          }}
        />
      )}

      {/* Форма переименования — панелью под деревом, а не в строке: строки
          здесь ровно по 48 пикселей, по ним считается жест перетаскивания, и
          раскрывшаяся посреди списка форма сбила бы прицел у соседних. Там
          же, где живёт шторка «Переместить в…». */}
      {renamingRow && (
        <div className="mt-2 flex justify-center">
          <CategoryEditForm
            locale={locale}
            category={renamingRow.node}
            open
            onClose={() => setRenaming(null)}
            onSaved={(updated) => {
              setRenaming(null);
              // Дерево здесь ведёт этот компонент, и `router.refresh()` из
              // формы до него не доходит: состояние заведено от пропа один
              // раз. Без этой замены рубрика оставалась бы со старым именем
              // до выхода из режима.
              setTree((current) => renameInTree(current, updated));
            }}
          />
        </div>
      )}

      {notice && (
        <NoticeBar
          locale={locale}
          notice={notice}
          onUndo={() => {
            if (notice.kind !== "done") return;
            setNotice(null);
            void commit(notice.id, notice.undo, true);
          }}
          onConfirm={() => {
            if (notice.kind !== "confirm") return;
            setNotice(null);
            void remove(notice.id);
          }}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  );
}

/** Куда встанет линия вставки в текущем списке строк. */
function insertionIndex(
  rows: FlatRow[],
  activeId: string,
  target: DropTarget,
): number {
  if (target.beforeId) {
    return rows.findIndex((row) => row.id === target.beforeId);
  }
  // Последним среди соседей — значит после всего поддерева последнего из них.
  const siblings = rows.filter((row) => row.parentId === target.parentId && row.id !== activeId);
  const last = siblings[siblings.length - 1];
  if (!last) {
    const parent = rows.findIndex((row) => row.id === target.parentId);
    return parent === -1 ? rows.length : parent + 1;
  }
  const subtree = subtreeIds(rows, last.id);
  return rows.findIndex((row) => row.id === subtree[subtree.length - 1]) + 1;
}

/** Линия вставки едет вправо-влево вместе с будущим уровнем узла. */
function InsertionLine({ offset }: { offset: number }) {
  return (
    <span
      aria-hidden
      style={{ marginInlineStart: offset }}
      className="pointer-events-none absolute inset-x-0 -top-px h-0.5 rounded bg-magenta"
    />
  );
}

/**
 * Альтернатива перетаскиванию: выбор родителя списком.
 *
 * На телефоне это к тому же быстрее драга и переживает промах пальцем, а
 * без неё интерфейс не проходит SC 2.5.7.
 */
function MovePicker({
  locale,
  rows,
  activeId,
  onPick,
  onClose,
}: {
  locale: LibraryLocale;
  rows: FlatRow[];
  activeId: string;
  onPick: (parentId: string | null) => void;
  onClose: () => void;
}) {
  const forbidden = forbiddenTargets(rows, activeId);
  const self = rows.find((row) => row.id === activeId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, "tree.moveTo")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    >
      <div className="glass max-h-[70dvh] w-full overflow-y-auto rounded-t-2xl border border-glass-brd p-4 sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-text-0">
            {pickLocalized(locale, {
              ru: self?.node.titleRu ?? null,
              en: self?.node.titleEn ?? null,
            })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, "add.categoryCancel")}
            className="grid h-11 w-11 place-items-center text-text-2 hover:text-text-0"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <ul className="flex flex-col gap-1">
          <li>
            <button
              type="button"
              onClick={() => onPick(null)}
              disabled={self?.parentId === null}
              className="w-full rounded-xl px-3 py-3 text-left text-sm text-text-0 hover:bg-bg-2 disabled:opacity-40"
            >
              {t(locale, "tree.moveToRoot")}
            </button>
          </li>
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onPick(row.id)}
                disabled={forbidden.has(row.id) || self?.parentId === row.id}
                style={{ paddingInlineStart: 12 + row.depth * INDENT }}
                className="w-full rounded-xl py-3 pe-3 text-left text-sm text-text-0 hover:bg-bg-2 disabled:opacity-40"
              >
                {pickLocalized(locale, {
                  ru: row.node.titleRu,
                  en: row.node.titleEn,
                })}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type Notice =
  | { kind: "done"; id: string; undo: DropTarget }
  /** Вопрос перед удалением: рубрика ещё на месте, решение за человеком. */
  | { kind: "confirm"; id: string }
  | { kind: "message"; message: string }
  | { kind: "error"; message: string };

/**
 * Откуда рубрику взяли — чтобы «Отменить» вернула её ровно туда.
 *
 * Отмена уходит на сервер тем же `move`, а не только перерисовывает
 * локально: иначе после обновления страницы рубрика оказалась бы на новом
 * месте, хотя человек нажал «Отменить».
 */
function whereItWas(rows: FlatRow[], id: string): DropTarget {
  const row = rows.find((item) => item.id === id);
  if (!row) return { parentId: null, beforeId: null, depth: 0 };
  const siblings = rows.filter((item) => item.parentId === row.parentId);
  const at = siblings.findIndex((item) => item.id === id);
  return {
    parentId: row.parentId,
    beforeId: siblings[at + 1]?.id ?? null,
    depth: row.depth,
  };
}

function NoticeBar({
  locale,
  notice,
  onUndo,
  onConfirm,
  onClose,
}: {
  locale: LibraryLocale;
  notice: Notice;
  onUndo: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // Вопрос сам не закрывается: полоса, исчезнувшая, пока человек читает,
  // означала бы отменённое действие без его ответа.
  const holds = notice.kind === "confirm";
  useEffect(() => {
    if (holds) return;
    const timer = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(timer);
  }, [holds, onClose]);

  return (
    <p
      role={notice.kind === "confirm" ? "alertdialog" : "status"}
      className="glass mt-3 flex items-center justify-between gap-3 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
    >
      <span>
        {notice.kind === "done"
          ? t(locale, "tree.moveDone")
          : notice.kind === "confirm"
            ? t(locale, "category.deleteConfirm")
            : notice.message}
      </span>
      {notice.kind === "done" && (
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 font-semibold text-cyan hover:text-text-0"
        >
          {t(locale, "tree.moveUndo")}
        </button>
      )}
      {notice.kind === "confirm" && (
        <span className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="font-semibold text-magenta hover:text-text-0"
          >
            {t(locale, "category.deleteConfirmYes")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-text-2 hover:text-text-0"
          >
            {t(locale, "add.categoryCancel")}
          </button>
        </span>
      )}
    </p>
  );
}

/** Почему сервер не отдал рубрику: у отказа два разных повода и два ответа. */
function deleteError(locale: LibraryLocale, code: string | undefined): string {
  if (code === "category_has_children")
    return t(locale, "category.deleteHasChildren");
  if (code === "category_not_empty")
    return t(locale, "category.deleteNotEmpty");
  return t(locale, "category.deleteFailed");
}

function moveError(locale: LibraryLocale, code: string | undefined): string {
  if (code === "move_into_own_subtree") return t(locale, "tree.moveCycle");
  if (code === "max_depth_exceeded") return t(locale, "tree.moveTooDeep");
  return t(locale, "tree.moveFailed");
}
