"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
} from "lucide-react";
import type {
  WorkBoardDto,
  WorkSpaceDto,
  WorkTaskCardDto,
} from "@vedamatch/shared";
import {
  createWorkTask,
  getWorkBoard,
  getWorkSpace,
  moveWorkTask,
} from "@/lib/work-api";
import {
  columnAt,
  dropIndexAt,
  type CardRect,
  type ColumnRect,
} from "./board-drop";
import {
  columnBeside,
  isOverWip,
  moveTaskLocally,
  neighboursOf,
} from "./board-state";
import { WorkInvitePanel } from "./invite-panel";
import { WorkTaskDialog } from "./task-dialog";

/** Сколько точек палец должен пройти, чтобы это считалось переносом, а не касанием. */
const DRAG_THRESHOLD = 6;

interface DragState {
  taskId: string;
  pointerId: number;
  columns: ColumnRect[];
  cardsByColumn: Record<string, CardRect[]>;
  target: { columnId: string; index: number } | null;
  started: boolean;
  startX: number;
  startY: number;
}

/** Среда и её первая доска одним заходом: экран без обеих бесполезен. */
async function fetchSpaceBoard(
  spaceId: string,
): Promise<{ space: WorkSpaceDto; board: WorkBoardDto | null }> {
  const space = await getWorkSpace(spaceId);
  const first = space.boards[0];
  return { space, board: first ? await getWorkBoard(first.id) : null };
}

export function WorkBoardView({ spaceId }: { spaceId: string }) {
  const [space, setSpace] = useState<WorkSpaceDto | null>(null);
  const [board, setBoard] = useState<WorkBoardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [composerColumn, setComposerColumn] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);

  const columnRefs = useRef(new Map<string, HTMLElement>());
  const cardRefs = useRef(new Map<string, HTMLElement>());

  // Ответ применяется, только пока открыта та же среда: ушли на соседнюю —
  // прилетевшая доска первой не должна подменить вторую.
  useEffect(() => {
    let alive = true;
    fetchSpaceBoard(spaceId)
      .then((loaded) => {
        if (!alive) return;
        setSpace(loaded.space);
        setBoard(loaded.board);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(
            cause instanceof Error ? cause.message : "Не удалось загрузить",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [spaceId]);

  const reload = useCallback(async () => {
    const loaded = await fetchSpaceBoard(spaceId);
    setSpace(loaded.space);
    setBoard(loaded.board);
  }, [spaceId]);

  const canEdit =
    board?.role === "owner" ||
    board?.role === "admin" ||
    board?.role === "member";

  /**
   * Перенос: доска перестраивается сразу, запрос уходит следом, ошибка
   * возвращает карточку обратно с объяснением. Ждать ответ под пальцем нельзя.
   */
  const commitMove = useCallback(
    async (taskId: string, columnId: string, index: number) => {
      if (!board) return;
      const before = board;
      const next = moveTaskLocally(board, taskId, columnId, index);
      setBoard(next);
      try {
        await moveWorkTask(taskId, {
          columnId,
          ...neighboursOf(next, taskId),
        });
      } catch (cause) {
        setBoard(before);
        setError(cause instanceof Error ? cause.message : "Перенос не удался");
      }
    },
    [board],
  );

  function measure(): Pick<DragState, "columns" | "cardsByColumn"> {
    const columns: ColumnRect[] = [];
    const cardsByColumn: Record<string, CardRect[]> = {};
    for (const column of board?.columns ?? []) {
      const element = columnRefs.current.get(column.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      columns.push({ id: column.id, left: rect.left, right: rect.right });
      cardsByColumn[column.id] = column.tasks.flatMap((task) => {
        const card = cardRefs.current.get(task.id);
        if (!card) return [];
        const cardRect = card.getBoundingClientRect();
        return [{ id: task.id, top: cardRect.top, bottom: cardRect.bottom }];
      });
    }
    return { columns, cardsByColumn };
  }

  function onHandleDown(event: React.PointerEvent, taskId: string) {
    if (!canEdit) return;
    // Замер один раз на старте: если пересчитывать на каждом движении, доска
    // под пальцем «дышит» и целиться становится невозможно.
    const measured = measure();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({
      taskId,
      pointerId: event.pointerId,
      ...measured,
      target: null,
      started: false,
      startX: event.clientX,
      startY: event.clientY,
    });
  }

  function onHandleMove(event: React.PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const movedEnough =
      Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD ||
      Math.abs(event.clientY - drag.startY) > DRAG_THRESHOLD;
    if (!drag.started && !movedEnough) return;

    const columnId = columnAt(drag.columns, event.clientX);
    if (!columnId) return;
    const index = dropIndexAt(
      drag.cardsByColumn[columnId] ?? [],
      event.clientY,
      drag.taskId,
    );
    setDrag({ ...drag, started: true, target: { columnId, index } });
  }

  function onHandleUp(event: React.PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const target = drag.started ? drag.target : null;
    setDrag(null);
    if (target) void commitMove(drag.taskId, target.columnId, target.index);
  }

  async function addTask(columnId: string) {
    if (!board || !draft.trim()) return;
    try {
      await createWorkTask(board.id, { columnId, title: draft.trim() });
      setDraft("");
      setBoard(await getWorkBoard(board.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    }
  }

  function moveBeside(task: WorkTaskCardDto, direction: -1 | 1) {
    if (!board) return;
    const columnId = columnBeside(board, task.columnId, direction);
    if (columnId) void commitMove(task.id, columnId, 0);
  }

  if (error && !board) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!space || !board) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-2">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Открываем доску…
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/work/planner"
          className="flex items-center gap-1 text-sm text-text-1 hover:text-text-0"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Все среды
        </Link>
        <h1 className="font-display text-xl font-bold text-text-0 sm:text-2xl">
          {space.name}
        </h1>
        <span className="rounded-full bg-glass px-2 py-0.5 font-mono text-xs uppercase text-text-2">
          {space.prefix}
        </span>
        <div className="ml-auto">
          <WorkInvitePanel space={space} onChanged={reload} />
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      )}

      {/* Колонки скроллятся вбок: на телефоне три колонки в ширину экрана не
          помещаются, а сжимать их до нечитаемости хуже, чем прокручивать. */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
        {board.columns.map((column) => {
          const over = isOverWip(column);
          return (
            <section
              key={column.id}
              ref={(element) => {
                if (element) columnRefs.current.set(column.id, element);
                else columnRefs.current.delete(column.id);
              }}
              aria-label={column.name}
              className="flex w-[280px] shrink-0 snap-start flex-col rounded-2xl glass p-3 sm:w-[300px]"
            >
              <header className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-text-0">
                  {column.name}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    over ? "bg-gold/20 text-gold" : "text-text-2"
                  }`}
                  title={
                    column.wipLimit > 0
                      ? `Лимит колонки: ${column.wipLimit}`
                      : undefined
                  }
                >
                  {column.tasks.length}
                  {column.wipLimit > 0 ? ` / ${column.wipLimit}` : ""}
                </span>
                {column.isDone && (
                  <Check aria-hidden className="ml-auto size-4 text-cyan" />
                )}
              </header>

              <ul className="flex min-h-[40px] flex-col gap-2">
                {column.tasks.map((task, index) => (
                  <li key={task.id}>
                    {drag?.target?.columnId === column.id &&
                      drag.target.index === index && <DropLine />}
                    <TaskCard
                      task={task}
                      dragging={
                        drag?.started === true && drag.taskId === task.id
                      }
                      canEdit={Boolean(canEdit)}
                      onOpen={() => setOpenTaskId(task.id)}
                      onHandleDown={(event) => onHandleDown(event, task.id)}
                      onHandleMove={onHandleMove}
                      onHandleUp={onHandleUp}
                      onMoveBeside={(direction) => moveBeside(task, direction)}
                      cardRef={(element) => {
                        if (element) cardRefs.current.set(task.id, element);
                        else cardRefs.current.delete(task.id);
                      }}
                    />
                  </li>
                ))}
                {drag?.target?.columnId === column.id &&
                  drag.target.index >= column.tasks.length && <DropLine />}
              </ul>

              {canEdit &&
                (composerColumn === column.id ? (
                  <form
                    className="mt-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void addTask(column.id);
                    }}
                  >
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void addTask(column.id);
                        }
                        if (event.key === "Escape") setComposerColumn(null);
                      }}
                      rows={2}
                      maxLength={200}
                      placeholder="Что нужно сделать"
                      aria-label={`Новая задача в колонке «${column.name}»`}
                      className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
                    />
                    <div className="mt-1 flex gap-2">
                      <button
                        type="submit"
                        className="rounded-lg bg-magenta px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Добавить
                      </button>
                      <button
                        type="button"
                        onClick={() => setComposerColumn(null)}
                        className="rounded-lg px-3 py-1.5 text-xs text-text-1"
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setComposerColumn(column.id);
                      setDraft("");
                    }}
                    className="mt-2 flex items-center gap-1 rounded-xl px-2 py-2 text-sm text-text-1 hover:text-text-0"
                  >
                    <Plus aria-hidden className="size-4" />
                    Задача
                  </button>
                ))}
            </section>
          );
        })}
      </div>

      {openTaskId && (
        <WorkTaskDialog
          taskId={openTaskId}
          board={board}
          onClose={() => setOpenTaskId(null)}
          onChanged={async () => setBoard(await getWorkBoard(board.id))}
        />
      )}
    </div>
  );
}

/** Щель, в которую встанет карточка. Полоса вместо тени — её видно и на солнце. */
function DropLine() {
  return <div aria-hidden className="mb-2 h-1 rounded-full bg-magenta/70" />;
}

function TaskCard({
  task,
  dragging,
  canEdit,
  onOpen,
  onHandleDown,
  onHandleMove,
  onHandleUp,
  onMoveBeside,
  cardRef,
}: {
  task: WorkTaskCardDto;
  dragging: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onHandleDown: (event: React.PointerEvent) => void;
  onHandleMove: (event: React.PointerEvent) => void;
  onHandleUp: (event: React.PointerEvent) => void;
  onMoveBeside: (direction: -1 | 1) => void;
  cardRef: (element: HTMLElement | null) => void;
}) {
  const overdue =
    task.dueAt !== null &&
    !task.completedAt &&
    new Date(task.dueAt) < new Date();

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border border-glass-brd bg-bg-1 p-2 transition-opacity ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-1">
        {canEdit && (
          // Ручка, а не вся карточка: перетаскивание за всю карточку отнимает
          // у телефона вертикальную прокрутку доски.
          // aria-hidden без role и без фокуса: для клавиатуры и скринридера
          // перенос делают кнопки ниже, а ручка — чисто указательный жест.
          <span
            aria-hidden
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className="mt-0.5 cursor-grab touch-none text-text-2"
          >
            <GripVertical className="size-4" />
          </span>
        )}
        <button type="button" onClick={onOpen} className="flex-1 text-left">
          <span className="block text-sm text-text-0">{task.title}</span>
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-5 text-xs text-text-2">
        <span className="font-mono">{task.key}</span>
        {task.labels.map((label) => (
          <span
            key={label.id}
            className="rounded-full bg-glass px-1.5 py-0.5 text-[10px] text-text-1"
          >
            {label.name}
          </span>
        ))}
        {task.dueAt && (
          <span
            className={`flex items-center gap-1 ${overdue ? "text-magenta" : ""}`}
          >
            <CalendarClock aria-hidden className="size-3.5" />
            {new Date(task.dueAt).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
        {task.checklistTotal > 0 && (
          <span className="flex items-center gap-1">
            <ListChecks aria-hidden className="size-3.5" />
            {task.checklistDone}/{task.checklistTotal}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare aria-hidden className="size-3.5" />
            {task.commentCount}
          </span>
        )}
        {task.assignee && (
          <span className="ml-auto truncate text-text-1">
            {task.assignee.name}
          </span>
        )}
      </div>

      {canEdit && (
        // Клавиатурный путь к переносу. Перетаскивание мышью и пальцем работает,
        // но им нельзя пользоваться с клавиатуры, а доска без переноса
        // бесполезна — поэтому кнопки видны всегда, а не только на наведении.
        <div className="mt-1 flex gap-1 pl-5">
          <button
            type="button"
            onClick={() => onMoveBeside(-1)}
            aria-label={`Перенести «${task.title}» в колонку слева`}
            className="rounded p-1 text-text-2 hover:text-text-0"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onMoveBeside(1)}
            aria-label={`Перенести «${task.title}» в колонку справа`}
            className="rounded p-1 text-text-2 hover:text-text-0"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
