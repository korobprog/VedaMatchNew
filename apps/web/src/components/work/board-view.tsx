"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
  ListChecks,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type {
  WorkBoardDto,
  WorkSpaceDto,
  WorkTaskCardDto,
  WorkTaskPriority,
} from "@vedamatch/shared";
import {
  createWorkColumn,
  createWorkTask,
  deleteWorkColumn,
  getWorkBoard,
  getWorkSpace,
  moveWorkTask,
  searchWorkBoardTasks,
  updateWorkColumn,
} from "@/lib/work-api";
import { plural } from "@/lib/plural";
import {
  columnAt,
  dropIndexAt,
  type CardRect,
  type ColumnRect,
} from "./board-drop";
import {
  columnBeside,
  columnNeighbours,
  isOverWip,
  looksDone,
  moveTaskLocally,
  neighboursOf,
} from "./board-state";
import {
  everyColumnCollapsed,
  expandCollapsedColumn,
  readCollapsedColumns,
  toggleAllColumns,
  toggleCollapsedColumn,
  writeCollapsedColumns,
} from "./column-collapse";
import { WorkArchivePanel } from "./archive-panel";
import { WorkInvitePanel } from "./invite-panel";
import {
  TASK_SEARCH_DEBOUNCE_MS,
  countTasks,
  isTaskQuery,
  searchColumns,
  searchSummary,
} from "./task-search";
import { WorkTaskDialog } from "./task-dialog";
import { dueFromInput, endOfDayInput } from "./task-due";
import { findTaskByKey, parseFocusKey } from "./task-focus";
import { splitTaskDraft } from "./task-title";
import { PRIORITY_TITLE, priorityMark } from "./task-priority";
import {
  groupTasksByPriority,
  readPriorityGrouping,
  writePriorityGrouping,
} from "./task-grouping";

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
  /** Архив доски (VED-61): выполненные и убранные карточки. */
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [composerColumn, setComposerColumn] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Исполнитель и срок новой задачи. Заполнены заранее — см. openComposer.
  const [draftAssignee, setDraftAssignee] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftPriority, setDraftPriority] = useState<WorkTaskPriority>("normal");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [columnDraft, setColumnDraft] = useState<string | null>(null);
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  // Свёрнутые колонки. Складываются только на телефоне: шире sm колонки стоят
  // в ряд, там прятать нечего.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  /* Группировка карточек по важности внутри раздела (VED-51). Это вид, а не
     порядок: позиции не трогаются, и выключенная группировка возвращает
     раздел таким, каким его выстроили руками. */
  const [grouped, setGrouped] = useState(false);
  /* Поиск по задачам (VED-76). `matches` — что нашёл сервер по последнему
     запросу; `null` — поиска нет, доска целиком. */
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const boardId = board?.id;
  useEffect(() => {
    if (!boardId || !isTaskQuery(query)) return;
    const text = query.trim();
    let alive = true;
    // Ответ на устаревший запрос не должен перебить свежий: `alive`
    // гасится, как только человек набрал следующую букву.
    const timer = setTimeout(() => {
      setSearching(true);
      searchWorkBoardTasks(boardId, text)
        .then((result) => {
          if (alive) setMatches(new Set(result.taskIds));
        })
        .catch(() => {
          if (alive) setError("Поиск не ответил — попробуйте ещё раз");
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, TASK_SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [boardId, query]);

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
        // Свёрнутое переживает перезагрузку: иначе на каждом заходе пришлось
        // бы складывать «Разное» заново.
        const wasCollapsed = loaded.board
          ? readCollapsedColumns(loaded.board.id)
          : [];
        /* Пришли по уведомлению «VED-42: новый комментарий» — открываем саму
           задачу, а не доску с полусотней чужих карточек. Ключ разбираем
           здесь, в ответе на загрузку: найти задачу можно только по уже
           приехавшей доске. */
        const focused = findTaskByKey(
          loaded.board,
          parseFocusKey(window.location.search),
        );
        setCollapsed(
          // Колонку нужной задачи разворачиваем: иначе, закрыв карточку,
          // человек упрётся в сложенную колонку и решит, что задачи нет.
          focused
            ? wasCollapsed.filter((id) => id !== focused.columnId)
            : wasCollapsed,
        );
        setGrouped(
          loaded.board ? readPriorityGrouping(loaded.board.id) : false,
        );
        if (focused) setOpenTaskId(focused.taskId);
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
  /** Колонки заводит и правит администрация среды, задачи — любой участник. */
  const canManage = board?.role === "owner" || board?.role === "admin";
  /** Свёрнута ли доска целиком — от этого зависит смысл кнопки в шапке. */
  const allFolded = everyColumnCollapsed(
    collapsed,
    board?.columns.map((column) => column.id) ?? [],
  );

  /**
   * Перенос: доска перестраивается сразу, запрос уходит следом, ошибка
   * возвращает карточку обратно с объяснением. Ждать ответ под пальцем нельзя.
   */
  const commitMove = useCallback(
    async (taskId: string, columnId: string, index: number) => {
      if (!board) return;
      // Карточку унесли в свёрнутую колонку — разворачиваем её. Иначе перенос
      // выглядит как пропажа: карточка ушла, а куда — не видно.
      const unfolded = expandCollapsedColumn(collapsed, columnId);
      if (unfolded !== collapsed) {
        setCollapsed(unfolded);
        writeCollapsedColumns(board.id, unfolded);
      }
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
    [board, collapsed],
  );

  function measure(): Pick<DragState, "columns" | "cardsByColumn"> {
    const columns: ColumnRect[] = [];
    const cardsByColumn: Record<string, CardRect[]> = {};
    for (const column of board?.columns ?? []) {
      const element = columnRefs.current.get(column.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      columns.push({
        id: column.id,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      });
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

    const columnId = columnAt(drag.columns, event.clientX, event.clientY);
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

  /**
   * Задачу заводят одним движением, поэтому исполнитель и срок в форме уже
   * стоят: себе и до конца сегодняшнего дня. Оба — самый частый случай, оба
   * меняются на месте, и оба нужны, чтобы карточка сразу попала в «Мой день»,
   * а не осела на доске без срока и без хозяина.
   */
  function openComposer(columnId: string) {
    setComposerColumn(columnId);
    setDraft("");
    setDraftAssignee(
      board?.members.some((member) => member.userId === board.viewerId)
        ? board.viewerId
        : "",
    );
    setDraftDue(endOfDayInput(new Date()));
    // Важность — единственное поле формы, которое начинает с нуля: «срочно»
    // у прошлой задачи ничего не говорит о следующей, а тихо унаследованное
    // «срочно» обесценивает метку на всей доске.
    setDraftPriority("normal");
  }

  async function addTask(columnId: string) {
    if (!board || !draft.trim()) return;
    const dueAt = dueFromInput(draftDue);
    /* Поле подписано как название, но пишут в него задачу целиком. Длинный
       текст делится сам: начало остаётся названием, остальное уезжает в
       описание — см. splitTaskDraft. Ничего не теряется. */
    const { title, description } = splitTaskDraft(draft);
    try {
      await createWorkTask(board.id, {
        columnId,
        title,
        description: description || undefined,
        assigneeId: draftAssignee || null,
        dueAt: dueAt ?? null,
        priority: draftPriority,
      });
      setDraft("");
      setDraftPriority("normal");
      setBoard(await getWorkBoard(board.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    }
  }

  /**
   * Своя колонка — это, например, «На доработку»: партнёр посмотрел и вернул.
   * Трёх колонок по умолчанию хватает, чтобы начать, но не хватает, чтобы
   * описать любой процесс, — поэтому добавить можно, а обязательно не нужно.
   */
  async function addColumn() {
    if (!board || !columnDraft?.trim()) return;
    try {
      setBoard(await createWorkColumn(board.id, { name: columnDraft.trim() }));
      setColumnDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    }
  }

  async function renameColumn(columnId: string, name: string) {
    if (!board || !name.trim()) return;
    try {
      setBoard(await updateWorkColumn(columnId, { name: name.trim() }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не переименовалось");
    }
  }

  /**
   * Порядок колонок — это порядок работы, и заводят его редко тем, каким он
   * останется: «Тестирование» появляется после «Готово», а стоять должно до.
   * Кнопками, а не перетаскиванием: колонок единицы, переставляют их раз в
   * жизни, а перетаскивание пришлось бы отбирать у карточек и у прокрутки.
   */
  async function moveColumn(columnId: string, direction: -1 | 1) {
    if (!board) return;
    const neighbours = columnNeighbours(board.columns, columnId, direction);
    if (!neighbours) return;
    try {
      setBoard(await updateWorkColumn(columnId, neighbours));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не переставилось");
    }
  }

  /**
   * «Готово» — не название, а свойство: задача, попавшая в такую колонку,
   * закрывается и уходит из «Моего дня», а вынутая — открывается обратно.
   * Свойство было только у колонок из заготовки; свою «Выполнено» отметить
   * было нечем, и сложенное в неё навсегда оставалось открытым.
   */
  async function toggleDone(columnId: string, isDone: boolean) {
    try {
      setBoard(await updateWorkColumn(columnId, { isDone }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не переключилось");
    }
  }

  async function removeColumn(columnId: string, name: string) {
    // Спрашиваем: колонку не вернуть, а кнопка стоит в одном ряду с
    // переименованием — так однажды и пропала «Готово» вместе со своей
    // галочкой.
    if (!window.confirm(`Удалить раздел «${name}»?`)) return;
    try {
      setBoard(await deleteWorkColumn(columnId));
    } catch (cause) {
      // Колонка с карточками не удаляется — сервер объясняет почему.
      setError(cause instanceof Error ? cause.message : "Не удалилось");
    }
  }

  /**
   * Свернуть колонку. Нужно на телефоне, где колонки стоят столбиком: «Разное»
   * с полусотней карточек отодвигает всё, что после него, за три экрана
   * прокрутки. Заголовок со счётчиком остаётся — свёрнутая колонка честно
   * говорит, сколько в ней задач.
   */
  function toggleColumn(columnId: string) {
    if (!board) return;
    const next = toggleCollapsedColumn(collapsed, columnId);
    setCollapsed(next);
    writeCollapsedColumns(board.id, next);
  }

  /**
   * Свернуть или развернуть всю доску разом. Складывать двенадцать колонок по
   * одной — то же самое листание, ради которого их и складывают.
   */
  function toggleAll() {
    if (!board) return;
    const next = toggleAllColumns(
      collapsed,
      board.columns.map((column) => column.id),
    );
    setCollapsed(next);
    writeCollapsedColumns(board.id, next);
  }

  /** Собрать карточки по важности (VED-51). Вид запоминается на устройстве. */
  function toggleGrouping() {
    if (!board) return;
    const next = !grouped;
    setGrouped(next);
    writePriorityGrouping(board.id, next);
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

  /** Что станет названием, а что описанием, — считаем на каждом нажатии
      клавиши: подсказка под полем должна показывать правду, а не обещание. */
  const draftSplit = splitTaskDraft(draft);

  const searchActive = matches !== null && isTaskQuery(query);
  const shownColumns = searchActive
    ? searchColumns(board.columns, matches)
    : board.columns;
  const found = countTasks({ columns: shownColumns });

  function changeQuery(value: string) {
    setQuery(value);
    // Стёртый запрос возвращает доску сразу, не дожидаясь паузы.
    if (!isTaskQuery(value)) setMatches(null);
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
        <div className="ml-auto flex items-center gap-2">
          {/* Только на телефоне, как и стрелки у колонок: шире sm колонки
              стоят в ряд, прятать их незачем. Одна кнопка, меняющая смысл, а
              не пара рядом: вторая всегда была бы бесполезной, а место
              занимала бы то же. */}
          {board.columns.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              aria-expanded={!allFolded}
              className="flex items-center gap-1.5 rounded-xl border border-glass-brd px-2.5 py-2 text-xs font-semibold text-text-1 hover:text-text-0 sm:hidden"
            >
              {allFolded ? (
                <ChevronDown aria-hidden className="size-3.5" />
              ) : (
                <ChevronUp aria-hidden className="size-3.5" />
              )}
              {allFolded ? "Развернуть все" : "Свернуть все"}
            </button>
          )}
          {/* Группировка по важности (VED-51). Один выключатель, а не пара
              кнопок: вторая всегда была бы бесполезной. Нажатое состояние
              видно не только рамкой — его называет `aria-pressed`. */}
          <button
            type="button"
            aria-pressed={grouped}
            onClick={toggleGrouping}
            title={
              grouped
                ? "Карточки собраны по важности; перетаскивание пока выключено"
                : "Собрать карточки раздела по важности: горящее сверху"
            }
            className={`rounded-xl border px-2.5 py-2 text-xs font-semibold ${
              grouped
                ? "border-cyan text-text-0"
                : "border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            По важности
          </button>
          <button
            type="button"
            onClick={() => setArchiveOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-glass-brd px-2.5 py-2 text-xs font-semibold text-text-1 hover:text-text-0"
          >
            <Archive aria-hidden className="size-3.5" />
            Архив
          </button>
          <WorkInvitePanel space={space} onChanged={reload} />
        </div>
      </div>

      {/* Поиск по задачам (VED-76): слова ищутся в названии, описании,
          метках, чек-листе, обсуждении и имени исполнителя, номер — как его
          пишут, «VED-76» или просто «76». */}
      <div className="mb-4">
        <label className="relative block sm:max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-2"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") changeQuery("");
            }}
            maxLength={120}
            aria-label="Поиск по задачам"
            placeholder="Поиск по задачам: слово или номер"
            className="w-full rounded-xl border border-glass-brd bg-bg-1 py-2 pl-9 pr-3 text-sm text-text-0"
          />
        </label>
        {searchActive && (
          <p role="status" className="mt-2 flex items-center gap-2 text-xs text-text-1">
            {searchSummary(found, countTasks(board))}
            {searching && (
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
            )}
            <button
              type="button"
              onClick={() => changeQuery("")}
              className="font-semibold text-text-0 underline underline-offset-2"
            >
              Показать все
            </button>
          </p>
        )}
      </div>

      {/* Сказать про выключенное перетаскивание словами: иначе карточка,
          которая перестала браться пальцем, читается как поломка. */}
      {grouped && (
        <p className="mb-3 text-xs text-text-2">
          Карточки собраны по важности. Перетаскивание пока выключено — порядок
          внутри раздела задаёт важность; перенести карточку в соседний раздел
          можно стрелками на ней.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      )}

      {/* На телефоне колонки идут столбиком, на экранах пошире — рядом с
          прокруткой вбок.

          Вбок их скроллило и на телефоне: три колонки в ширину экрана не
          помещаются, а сжимать их до нечитаемости хуже, чем прокручивать. Но
          боковая прокрутка внутри страницы, которая и сама прокручивается
          вниз, отдаёт колонку шириной в половину экрана и прячет остальные за
          краем: доску не видно целиком, и каждое движение приходится выбирать
          между двумя осями. Столбиком видно всё, а порядок колонок сверху
          вниз читается так же, как слева направо. */}
      <div className="-mx-4 flex flex-col gap-3 px-4 pb-4 sm:snap-x sm:flex-row sm:overflow-x-auto">
        {shownColumns.map((column) => {
          // Номер, лимит и «пустая ли колонка» — по доске целиком: поиск
          // прячет карточки, но не убирает их из колонки.
          const full =
            board.columns.find((item) => item.id === column.id) ?? column;
          const index = board.columns.indexOf(full);
          const over = isOverWip(full);
          // Свёрнутая колонка прятала бы найденное: на время поиска все
          // колонки с совпадениями раскрыты.
          const folded = !searchActive && collapsed.includes(column.id);
          const bodyId = `work-column-body-${column.id}`;
          /* Карточка одна и та же в обоих видах — обычном и сгруппированном:
             две копии разъехались бы на первой же правке. */
          const renderCard = (task: WorkTaskCardDto) => (
            <TaskCard
              task={task}
              dragging={drag?.started === true && drag.taskId === task.id}
              canEdit={Boolean(canEdit)}
              // Место вставки считается по порядку видимых карточек: во время
              // поиска видны не все, а в группах порядок другой — и там, и там
              // карточка легла бы не туда. Кнопки переноса работают всегда.
              draggable={!searchActive && !grouped}
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
          );
          return (
            <section
              key={column.id}
              ref={(element) => {
                if (element) columnRefs.current.set(column.id, element);
                else columnRefs.current.delete(column.id);
              }}
              aria-label={column.name}
              className={`flex w-full flex-col rounded-2xl glass p-3 sm:w-[300px] sm:shrink-0 sm:snap-start ${
                folded && drag?.target?.columnId === column.id
                  ? "ring-2 ring-magenta"
                  : ""
              }`}
            >
              <header className="mb-2 flex items-center gap-2">
                {/* Свернуть можно только на телефоне: шире sm колонки стоят в
                    ряд, и прятать их содержимое незачем. Счётчик рядом остаётся
                    виден всегда — он и есть содержание свёрнутой колонки,
                    поэтому же число повторено словами в подписи кнопки. */}
                <button
                  type="button"
                  aria-expanded={!folded}
                  aria-controls={bodyId}
                  aria-label={`${
                    folded ? "Развернуть" : "Свернуть"
                  } раздел «${column.name}», ${full.tasks.length} ${plural(
                    full.tasks.length,
                    "задача",
                    "задачи",
                    "задач",
                  )}`}
                  onClick={() => toggleColumn(column.id)}
                  className="-ml-1 rounded px-2 py-2.5 text-text-2 hover:text-text-0 sm:hidden"
                >
                  {folded ? (
                    <ChevronRight aria-hidden className="size-5" />
                  ) : (
                    <ChevronDown aria-hidden className="size-5" />
                  )}
                </button>
                {/* Заголовок остаётся заголовком: поле ввода вместо него
                    лишает скринридер структуры доски. Переименование
                    включается кнопкой и живёт ровно пока правят. */}
                {renamingColumn === column.id ? (
                  <input
                    autoFocus
                    defaultValue={column.name}
                    aria-label={`Название раздела «${column.name}»`}
                    maxLength={40}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setRenamingColumn(null);
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    onBlur={(event) => {
                      setRenamingColumn(null);
                      if (event.target.value.trim() !== column.name) {
                        void renameColumn(column.id, event.target.value);
                      }
                    }}
                    className="w-28 rounded border border-glass-brd bg-bg-1 px-1 py-0.5 text-sm font-semibold text-text-0"
                  />
                ) : (
                  <h2 className="text-sm font-semibold text-text-0">
                    {column.name}
                  </h2>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    over ? "bg-gold/20 text-gold" : "text-text-2"
                  }`}
                  title={
                    column.wipLimit > 0
                      ? `Лимит раздела: ${column.wipLimit}`
                      : undefined
                  }
                >
                  {searchActive
                    ? `${column.tasks.length} из ${full.tasks.length}`
                    : `${column.tasks.length}${
                        column.wipLimit > 0 ? ` / ${column.wipLimit}` : ""
                      }`}
                </span>
                {/* Галочка — не украшение: она и делает колонку завершающей.
                    Администрации это переключатель, остальным — отметка. */}
                {canManage ? (
                  <button
                    type="button"
                    aria-pressed={column.isDone}
                    aria-label={`Раздел «${column.name}» закрывает задачи`}
                    title={
                      column.isDone
                        ? "Задачи здесь считаются выполненными"
                        : "Отметить раздел завершающим"
                    }
                    onClick={() => void toggleDone(column.id, !column.isDone)}
                    className={`rounded p-1 ${
                      column.isDone
                        ? "text-cyan"
                        : "text-text-2 opacity-40 hover:opacity-100"
                    }`}
                  >
                    <Check aria-hidden className="size-4" />
                  </button>
                ) : (
                  column.isDone && (
                    <Check aria-hidden className="size-4 text-cyan" />
                  )
                )}
                {/* «Раньше» и «позже», а не «левее» и «правее»: на телефоне
                    колонки стоят столбиком, и «левее» показывало бы вверх.
                    Стрелка разворачивается вслед за раскладкой — так же, как
                    у кнопок переноса карточки. */}
                {canManage && (
                  <span className="ml-auto flex">
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={`Переставить раздел «${column.name}» раньше`}
                      onClick={() => void moveColumn(column.id, -1)}
                      className="rounded p-1 text-text-2 hover:text-text-0 disabled:opacity-30"
                    >
                      <ChevronUp aria-hidden className="size-3.5 sm:hidden" />
                      <ChevronLeft
                        aria-hidden
                        className="hidden size-3.5 sm:block"
                      />
                    </button>
                    <button
                      type="button"
                      disabled={index === board.columns.length - 1}
                      aria-label={`Переставить раздел «${column.name}» позже`}
                      onClick={() => void moveColumn(column.id, 1)}
                      className="rounded p-1 text-text-2 hover:text-text-0 disabled:opacity-30"
                    >
                      <ChevronDown aria-hidden className="size-3.5 sm:hidden" />
                      <ChevronRight
                        aria-hidden
                        className="hidden size-3.5 sm:block"
                      />
                    </button>
                  </span>
                )}
                {canManage && renamingColumn !== column.id && (
                  <button
                    type="button"
                    aria-label={`Переименовать раздел «${column.name}»`}
                    onClick={() => setRenamingColumn(column.id)}
                    className="rounded p-1 text-text-2 hover:text-text-0"
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </button>
                )}
                {/* Удалить предлагаем только пустую: колонка с карточками
                    всё равно не удалится, и кнопка обещала бы невозможное. */}
                {canManage && full.tasks.length === 0 && (
                  <button
                    type="button"
                    aria-label={`Удалить раздел «${column.name}»`}
                    onClick={() => void removeColumn(column.id, column.name)}
                    className="rounded p-1 text-text-2 hover:text-magenta"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                )}
              </header>

              {/* Колонка называется «Выполнено», а задачи в ней остаются
                  открытыми: закрывает их признак колонки, а не название. Без
                  него счётчик среды не уменьшается, сколько туда ни клади, —
                  и человек месяцами не понимает почему. Спрашиваем прямо,
                  вместе с кнопкой, которая это чинит одним нажатием. */}
              {canManage && !column.isDone && looksDone(column.name) && (
                <p className="mb-2 rounded-xl border border-gold/40 bg-gold/10 p-2 text-xs text-text-1">
                  Задачи в этом разделе остаются открытыми и считаются в
                  счётчике среды.{" "}
                  <button
                    type="button"
                    onClick={() => void toggleDone(column.id, true)}
                    className="font-semibold text-text-0 underline"
                  >
                    Отмечать выполненными
                  </button>
                </p>
              )}

              {/* Тело колонки: форма и карточки. Прячется только на узком
                  экране — на широком колонка всегда развёрнута. */}
              <div
                id={bodyId}
                className={folded ? "hidden sm:block" : undefined}
              >
                {canEdit &&
                  (composerColumn === column.id ? (
                    <form
                      className="mb-2"
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
                        maxLength={2000}
                        placeholder="Что нужно сделать"
                        aria-label={`Новая задача в разделе «${column.name}»`}
                        className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
                      />
                      {/* Говорим заранее, что произойдёт: молча разрезанный
                          текст выглядел бы как потеря половины написанного.

                          Сам будущий заголовок переносится по буквам: в него
                          попадает то, что написал человек, а сплошная строка
                          без пробелов вылезала за край колонки. Переносим
                          только его — обычные слова подсказки от `break-all`
                          рвались бы на середине. */}
                      {draftSplit.description && (
                        <p className="mt-1 text-xs text-text-2">
                          Длинно для названия. В нём останется{" "}
                          <span className="break-all text-text-1">
                            «{draftSplit.title}»
                          </span>{" "}
                          — остальное уедет в описание.
                        </p>
                      )}
                      <div className="mt-2 grid gap-2">
                        <label className="text-xs text-text-1">
                          Исполнитель
                          <select
                            value={draftAssignee}
                            onChange={(event) =>
                              setDraftAssignee(event.target.value)
                            }
                            className="mt-1 block w-full rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0"
                          >
                            <option value="">Никто</option>
                            {board.members.map((member) => (
                              <option key={member.userId} value={member.userId}>
                                {member.userId === board.viewerId
                                  ? `${member.name} (вы)`
                                  : member.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs text-text-1">
                          Срок
                          <input
                            type="datetime-local"
                            value={draftDue}
                            onChange={(event) => setDraftDue(event.target.value)}
                            className="mt-1 block w-full rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0"
                          />
                        </label>
                        {/* Важность здесь же, а не в открытой карточке:
                            «срочно» известно в ту же секунду, что и название,
                            а за вторым заходом его обычно не ставят вовсе. */}
                        <label className="text-xs text-text-1">
                          Важность
                          <select
                            value={draftPriority}
                            onChange={(event) =>
                              setDraftPriority(
                                event.target.value as WorkTaskPriority,
                              )
                            }
                            className="mt-1 block w-full rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0"
                          >
                            {Object.entries(PRIORITY_TITLE).map(
                              ([value, title]) => (
                                <option key={value} value={value}>
                                  {title}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                      <div className="mt-2 flex gap-2">
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
                      onClick={() => openComposer(column.id)}
                      className="mb-2 flex items-center gap-1 rounded-xl px-2 py-2 text-sm text-text-1 hover:text-text-0"
                    >
                      <Plus aria-hidden className="size-4" />
                      Задача
                    </button>
                  ))}

                {/* Сгруппированный раздел — тот же список, разложенный по
                    важности: горящее сверху, пустые группы не занимают строку.
                    Подпись группы — заголовок третьего уровня под названием
                    раздела: скринридер должен слышать вложенность, а не
                    ровный ряд карточек. */}
                {grouped ? (
                  <div className="flex min-h-[40px] flex-col gap-3">
                    {groupTasksByPriority(column.tasks).map((group) => {
                      const mark = priorityMark(group.priority);
                      return (
                        <div key={group.priority}>
                          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-2">
                            {mark && (
                              <span
                                aria-hidden
                                className={`size-1.5 rounded-full ${mark.dot}`}
                              />
                            )}
                            {group.title}
                            <span className="font-normal">
                              {group.tasks.length}
                            </span>
                          </h3>
                          <ul className="flex flex-col gap-2">
                            {group.tasks.map((task) => (
                              <li key={task.id}>{renderCard(task)}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <ul className="flex min-h-[40px] flex-col gap-2">
                    {column.tasks.map((task, index) => (
                      <li key={task.id}>
                        {drag?.target?.columnId === column.id &&
                          drag.target.index === index && <DropLine />}
                        {renderCard(task)}
                      </li>
                    ))}
                    {drag?.target?.columnId === column.id &&
                      drag.target.index >= column.tasks.length && <DropLine />}
                  </ul>
                )}
              </div>
            </section>
          );
        })}

        {canManage &&
          !searchActive &&
          (columnDraft === null ? (
            <button
              type="button"
              onClick={() => setColumnDraft("")}
              className="flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-glass-brd px-3 py-4 text-sm text-text-1 hover:text-text-0 sm:w-[200px] sm:shrink-0 sm:snap-start"
            >
              <Plus aria-hidden className="size-4" />
              Раздел
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addColumn();
              }}
              className="flex w-full flex-col gap-2 rounded-2xl glass p-3 sm:w-[240px] sm:shrink-0 sm:snap-start"
            >
              <input
                autoFocus
                value={columnDraft}
                onChange={(event) => setColumnDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setColumnDraft(null);
                }}
                maxLength={40}
                placeholder="На доработку"
                aria-label="Название нового раздела"
                className="rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-magenta px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Добавить
                </button>
                <button
                  type="button"
                  onClick={() => setColumnDraft(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-text-1"
                >
                  Отмена
                </button>
              </div>
            </form>
          ))}
      </div>

      {archiveOpen && (
        <WorkArchivePanel
          boardId={board.id}
          canEdit={Boolean(canEdit)}
          covered={openTaskId !== null}
          onOpenTask={setOpenTaskId}
          onRestored={() => void reload()}
          onClose={() => setArchiveOpen(false)}
        />
      )}

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
  draggable,
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
  draggable: boolean;
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
  const mark = priorityMark(task.priority);

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border border-glass-brd bg-bg-1 p-2 transition-opacity ${
        mark?.edge ?? ""
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1">
        {canEdit && draggable && (
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
        {/* Точка и слово вместе: цветного края мало — на солнце и при
            дальтонизме золото от пурпура не отличить. */}
        {mark && (
          <span className="flex items-center gap-1 rounded-full bg-glass px-1.5 py-0.5 text-[10px] text-text-1">
            <span aria-hidden className={`size-1.5 rounded-full ${mark.dot}`} />
            {mark.label}
          </span>
        )}
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
        //
        // «Предыдущая» и «следующая», а не «слева» и «справа»: на телефоне
        // колонки стоят столбиком, и «слева» там показывало бы вверх. Стрелка
        // разворачивается вслед за раскладкой по той же причине.
        <div className="mt-1 flex gap-1 pl-5">
          <button
            type="button"
            onClick={() => onMoveBeside(-1)}
            aria-label={`Перенести «${task.title}» в предыдущий раздел`}
            className="rounded p-1 text-text-2 hover:text-text-0"
          >
            <ChevronUp aria-hidden className="size-4 sm:hidden" />
            <ChevronLeft aria-hidden className="hidden size-4 sm:block" />
          </button>
          <button
            type="button"
            onClick={() => onMoveBeside(1)}
            aria-label={`Перенести «${task.title}» в следующий раздел`}
            className="rounded p-1 text-text-2 hover:text-text-0"
          >
            <ChevronDown aria-hidden className="size-4 sm:hidden" />
            <ChevronRight aria-hidden className="hidden size-4 sm:block" />
          </button>
        </div>
      )}
    </div>
  );
}
