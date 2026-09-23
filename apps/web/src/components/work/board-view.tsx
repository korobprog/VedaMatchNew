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
  FolderClosed,
  FolderOpen,
  GripVertical,
  History,
  ListChecks,
  Loader2,
  MessageSquare,
  Paperclip,
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
  attachWorkFile,
  createWorkColumn,
  createWorkTask,
  deleteWorkColumn,
  getWorkBoard,
  getWorkSpace,
  moveWorkTask,
  searchWorkBoardTasks,
  setWorkTaskViewed,
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
import { workPersonLabel, workPersonShortLabel } from "./person-label";
import { workToolbarButtonClass } from "./toolbar-button";
import {
  TASK_SEARCH_DEBOUNCE_MS,
  countMatches,
  countTasks,
  isColumnFolded,
  isTaskQuery,
  searchBoardColumns,
  searchColumns,
  SEARCH_SHOW_ALL,
  SEARCH_SHOW_FOUND,
  searchSummary,
} from "./task-search";
import { WorkTaskDialog } from "./task-dialog";
import { findTaskByKey, parseFocusKey } from "./task-focus";
import { BOARD_REFRESH_MS, shouldApplyBoardRefresh } from "./board-refresh";
import { StatusMarkBadge } from "@/components/status-mark-badge";
import {
  boardDropIndex,
  countForeign,
  folderColumns,
  foreignFolderHint,
  setTaskViewedLocally,
  taskMark,
  type WorkTaskFolder,
} from "./foreign-tasks";
import {
  MAX_FILES_AT_ONCE,
  uploadInTurn,
  uploadProblemMessage,
} from "./attach-files";
import { deriveTaskTitle, taskFromDraft } from "./task-title";
import { PRIORITY_TITLE, priorityMark } from "./task-priority";
import { groupTasksByPriority } from "./task-grouping";
import {
  groupTasksByCreatedDate,
  groupTasksByEditedDate,
} from "./task-created-grouping";
import {
  columnGroupOf,
  isStatusColumn,
  orderColumnsByKind,
  splitColumnsByKind,
} from "./task-section";
import {
  readWorkGroupMode,
  writeWorkGroupMode,
  type WorkGroupMode,
} from "./task-view-mode";

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
  const [board, setBoardState] = useState<WorkBoardDto | null>(null);
  /* Номер своей правки доски (VED-272): каждая подстановка доски его
     увеличивает. Перечитывание по таймеру сверяется с ним и не затирает
     правку, сделанную, пока шёл запрос. */
  const boardEdits = useRef(0);
  const setBoard = useCallback((next: WorkBoardDto | null) => {
    boardEdits.current += 1;
    setBoardState(next);
  }, []);
  /** Сколько переносов ещё летит на сервер: доску под ними не перечитываем. */
  const pendingMoves = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  /** Архив доски (VED-61): выполненные и убранные карточки. */
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [composerColumn, setComposerColumn] = useState<string | null>(null);
  /* Черновик новой задачи — это ОПИСАНИЕ, а не название (VED-324): человек
     пишет задачу как думает, заголовок собирается сам. Свой заголовок живёт
     отдельным состоянием, и `null` в нём значит «собери сам»: пустая строка
     значила бы «человек стёр заголовок» и затирала бы выведенный. */
  const [draft, setDraft] = useState("");
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  /* Обе кнопки переключения заголовка исчезают от собственного нажатия: поле
     правки и строка с выведенным заголовком показываются по очереди. Фокус
     при этом падал на `body` — с клавиатуры человек терял место, а скринридер
     не узнавал, что появилось поле. Поэтому фокус переносим руками: в поле,
     когда открыли правку, и обратно на «Изменить», когда вернулись к
     выведенному заголовку (WCAG 2.2, SC 2.4.3). */
  const editTitleRef = useRef<HTMLButtonElement>(null);
  const returnFocusToEditTitle = useRef(false);
  /* Скриншоты, выбранные до создания карточки. Сервер принимает вложения
     только к существующей задаче, поэтому файлы ждут здесь и уходят сразу
     после неё — иначе «специально заходить в недоделанную задачу» остаётся,
     а именно от этого и просили избавить. */
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  // Исполнитель новой задачи. Заполнен заранее — см. openComposer.
  const [draftAssignee, setDraftAssignee] = useState("");
  const [draftPriority, setDraftPriority] =
    useState<WorkTaskPriority>("normal");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [columnDraft, setColumnDraft] = useState<string | null>(null);
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  // Свёрнутые колонки. Складываются только на телефоне: шире sm колонки стоят
  // в ряд, там прятать нечего.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  /* Вид раздела: обычный список, «По важности» (VED-51) или «По дате»
     (VED-160). Один переключатель на оба режима, а не два флага, — они
     несовместимы: непонятно, что рисовать, если включены разом. Это вид, а
     не порядок: позиции карточек не трогаются, и режим «none» возвращает
     раздел таким, каким его выстроили руками. */
  const [groupMode, setGroupMode] = useState<WorkGroupMode>("none");
  /* Поиск по задачам (VED-76). `matches` — что нашёл сервер по последнему
     запросу; `null` — поиска нет, доска целиком. */
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  /* «Показать все» (VED-131): вся доска с выделенными находками, а не одни
     находки. Запрос при этом остаётся в поле — см. `searchBoardColumns`. */
  const [revealAll, setRevealAll] = useState(false);
  /* Какая «папка» открыта (VED-320): свои задачи или чужие — те, что
     составил и ведёт другой участник. По умолчанию свои, и на каждом заходе
     заново: заказчик просил, чтобы чужих «не было видно по умолчанию». */
  const [folder, setFolder] = useState<WorkTaskFolder>("mine");
  const boardId = board?.id;
  const dragging = useRef(false);
  useEffect(() => {
    dragging.current = drag !== null;
  }, [drag]);

  /* Доска догоняет чужие правки (VED-272): вернулись на вкладку — и раз в
     минуту, пока она на экране. Тестировщик перенёс карточку в «Выполнено»
     — у остальных ярлык сменится без перезагрузки, как пометка в ленте. */
  useEffect(() => {
    if (!boardId) return;
    let alive = true;
    let inFlight = false;
    async function refresh() {
      if (!boardId || inFlight || document.visibilityState !== "visible") {
        return;
      }
      if (pendingMoves.current > 0 || dragging.current) return;
      inFlight = true;
      const startedAt = boardEdits.current;
      try {
        const next = await getWorkBoard(boardId);
        const apply = shouldApplyBoardRefresh({
          startedAt,
          current: boardEdits.current,
          pendingMoves: pendingMoves.current,
          dragging: dragging.current,
        });
        // Своим сеттером, а не `setBoard`: номер правки двигают только
        // правки человека, иначе таймер отменял бы сам себя.
        if (alive && apply) setBoardState(next);
      } catch {
        // Молча: сеть моргнула — следующий тик принесёт свежее, а ошибка
        // поверх доски, которую человек не трогал, только пугала бы.
      } finally {
        inFlight = false;
      }
    }
    const onVisible = () => void refresh();
    const timer = window.setInterval(onVisible, BOARD_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [boardId]);

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
        setGroupMode(
          loaded.board ? readWorkGroupMode(loaded.board.id) : "none",
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
  }, [spaceId, setBoard]);

  const reload = useCallback(async () => {
    const loaded = await fetchSpaceBoard(spaceId);
    setSpace(loaded.space);
    setBoard(loaded.board);
  }, [spaceId, setBoard]);

  /* Вернулись к выведенному заголовку — вернуть и фокус на кнопку, которой
     это сделали: она пересоздаётся, и без этого фокус остаётся на `body`.
     Флагом, а не по самому `draftTitle`: открытие формы тоже ставит `null`, а
     там фокус принадлежит полю описания. */
  useEffect(() => {
    if (draftTitle === null && returnFocusToEditTitle.current) {
      returnFocusToEditTitle.current = false;
      editTitleRef.current?.focus();
    }
  }, [draftTitle]);

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
      pendingMoves.current += 1;
      try {
        await moveWorkTask(taskId, {
          columnId,
          ...neighboursOf(next, taskId),
        });
      } catch (cause) {
        setBoard(before);
        setError(cause instanceof Error ? cause.message : "Перенос не удался");
      } finally {
        pendingMoves.current -= 1;
      }
    },
    [board, collapsed, setBoard],
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
    if (!target) return;
    // Щель считали по нарисованному, а чужие карточки в колонке спрятаны
    // (VED-320): переводим место в индекс во всей колонке.
    const column = board?.columns.find((item) => item.id === target.columnId);
    const index = column
      ? boardDropIndex(
          column.tasks,
          (task) => !task.foreign,
          drag.taskId,
          target.index,
        )
      : target.index;
    void commitMove(drag.taskId, target.columnId, index);
  }

  /**
   * «Просмотрено» (VED-365): своя отметка на карточке, сразу и без ожидания
   * сервера. Неудача возвращает кнопку и говорит почему — иначе человек
   * уверен, что отметил, а после перезагрузки отметки нет.
   */
  async function toggleViewed(taskId: string, viewed: boolean) {
    if (!board) return;
    const before = board;
    setBoard(setTaskViewedLocally(board, taskId, viewed));
    try {
      await setWorkTaskViewed(taskId, { viewed });
    } catch (cause) {
      setBoard(before);
      setError(
        cause instanceof Error ? cause.message : "Отметка не сохранилась",
      );
    }
  }

  /**
   * Задачу заводят одним движением, поэтому исполнитель в форме уже стоит:
   * себе — самый частый случай, меняется на месте.
   *
   * Срока в форме больше нет (VED-378, «спрячь графу Срок внутрь карточки»):
   * его ставят в открытой карточке. Молча подставлять «сегодня до 23:59», как
   * раньше, при спрятанном поле нельзя — назавтра каждая новая задача
   * краснела бы просроченной, а откуда у неё срок, человек бы не знал.
   */
  function openComposer(columnId: string) {
    setComposerColumn(columnId);
    setDraft("");
    setDraftTitle(null);
    setDraftFiles([]);
    setDraftAssignee(
      board?.members.some((member) => member.userId === board.viewerId)
        ? board.viewerId
        : "",
    );
    // Важность — единственное поле формы, которое начинает с нуля: «срочно»
    // у прошлой задачи ничего не говорит о следующей, а тихо унаследованное
    // «срочно» обесценивает метку на всей доске.
    setDraftPriority("normal");
  }

  /**
   * Завести задачу по написанному описанию (VED-324).
   *
   * Порядок — карточка, потом файлы: вложение сервер принимает только к
   * существующей задаче. Сбой загрузки карточку не отменяет — она уже заведена
   * и текст в ней есть, — но и молчать о нём нельзя: человек думает, что
   * скриншот приложен, а его нет.
   */
  async function addTask(columnId: string) {
    if (!board || !draft.trim() || saving) return;
    const { title, description } = taskFromDraft(draft, draftTitle);
    const files = draftFiles;
    setSaving(true);
    try {
      const task = await createWorkTask(board.id, {
        columnId,
        title,
        description: description || undefined,
        assigneeId: draftAssignee || null,
        dueAt: null,
        priority: draftPriority,
      });
      if (files.length > 0) {
        const result = await uploadInTurn(files, (file) =>
          attachWorkFile(task.id, file),
        );
        const problem = uploadProblemMessage(result);
        setError(problem ? `${task.key}: ${problem}` : null);
      } else {
        setError(null);
      }
      setDraft("");
      setDraftTitle(null);
      setDraftFiles([]);
      setDraftPriority("normal");
      // Заведённая задача — форма прячется под «+ Задача» (VED-424): иначе
      // она оставалась открытой и выкатывалась снова при каждом развороте
      // раздела.
      setComposerColumn(null);
      setBoard(await getWorkBoard(board.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setSaving(false);
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
    // Разделы и статусы стоят двумя группами (VED-430): колонку переставляют
    // внутри своей группы, по соседям в ней.
    const neighbours = columnNeighbours(
      columnGroupOf(board.columns, columnId),
      columnId,
      direction,
    );
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
    if (composerColumn === columnId) closeEmptyComposer();
  }

  /**
   * Пустая форма новой задачи прячется под «+ Задача», когда раздел
   * сворачивают или разворачивают (VED-424): заказчик разворачивал раздел, а
   * там снова выкатывалась форма, открытая когда-то раньше. Начатое описание
   * или выбранные скриншоты форму держат — их не выбрасываем.
   */
  function closeEmptyComposer() {
    if (!draft.trim() && draftFiles.length === 0) setComposerColumn(null);
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
    closeEmptyComposer();
  }

  /** Переключить вид раздела (VED-51, VED-160). Нажатие на активный режим
      возвращает обычный список, нажатие на другой — переключает режим
      целиком: оба разом не горят, второй виток отменяет первый. Вид
      запоминается на устройстве. */
  function toggleGroupMode(mode: WorkGroupMode) {
    if (!board) return;
    const next = groupMode === mode ? "none" : mode;
    setGroupMode(next);
    writeWorkGroupMode(board.id, next);
  }

  function moveBeside(task: WorkTaskCardDto, direction: -1 | 1) {
    if (!board) return;
    // «Следующий» — следующий на экране: разделы, потом статусы (VED-430).
    const columnId = columnBeside(
      { ...board, columns: orderColumnsByKind(board.columns) },
      task.columnId,
      direction,
    );
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

  /** Заголовок, который получится из написанного, — считаем на каждом нажатии
      клавиши: строка под полем должна показывать правду, а не обещание. */
  const autoTitle = deriveTaskTitle(draft);

  /* «Сегодня» для группировки по дате создания (VED-160) — момент рендера,
     местное время браузера: границы дня у человека в Красноярске и на
     сервере в Амстердаме разные, поэтому не Date.now() внутри чистой
     функции, а один снимок времени на весь проход по колонкам. */
  const now = new Date();

  const searchActive = matches !== null && isTaskQuery(query);
  /* «Чужие» (VED-320) — отдельная папка: по умолчанию их на доске нет, есть
     кнопка с числом. Чужих не осталось (забрали себе, закрыли) — папка
     закрывается сама, иначе человек смотрел бы на пустую доску. Поиск ищет
     по всей доске, чужое тоже: найденное прятать нельзя, а ярлык «Чужое»
     скажет, чьё оно. */
  const foreignTotal = countForeign(board.columns);
  const activeFolder: WorkTaskFolder = foreignTotal > 0 ? folder : "mine";
  const inForeign = activeFolder === "foreign";
  /* Сначала разделы, потом статусы (VED-430): «нужно отделить разделы
     задач и разделы их статусов». Между группами — подпись «Статусы». */
  const shownColumns = orderColumnsByKind(
    searchActive
      ? searchBoardColumns(board.columns, matches, revealAll)
      : folderColumns(board.columns, activeFolder),
  );
  const firstStatusId = shownColumns.some((column) => !isStatusColumn(column))
    ? shownColumns.find(isStatusColumn)?.id
    : undefined;
  /** Названия разделов — для подписи раздела на карточке в статусе. */
  const sectionNames = new Map(
    splitColumnsByKind(board.columns).sections.map((column) => [
      column.id,
      column.name,
    ]),
  );
  // Находки считаем по доске, а не по нарисованному: при «Показать все»
  // нарисовано всё.
  const found = searchActive
    ? countTasks({ columns: searchColumns(board.columns, matches) })
    : 0;

  function changeQuery(value: string) {
    setQuery(value);
    // Стёртый запрос возвращает доску сразу, не дожидаясь паузы.
    if (!isTaskQuery(value)) {
      setMatches(null);
      setRevealAll(false);
    }
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
        {/* Приглашения и участники — в строке с названием среды, а не в
            панели вида (VED-421): «кнопку ссылка убери отсюда, он тут не в
            тему и занимает место». Панель — про то, как разложить задачи;
            состав среды — про саму среду, ему место рядом с её именем. */}
        <span className="ml-auto">
          <WorkInvitePanel
            space={space}
            viewerId={board.viewerId}
            onChanged={reload}
          />
        </span>
        {/* Один ряд, слева направо: «Свернуть все» (только на телефоне), «По
            дате», «По важности», «Архив», «Пригласить» — порядок, которого
            просил тестировщик (VED-160, круг 3). Раньше «Архив» с
            «Пригласить» переносились строкой ниже: пяти кнопкам с полным
            текстом на 360 точках не хватало места. Три второстепенные кнопки
            («Свернуть все», «Архив», «Пригласить») на телефоне остаются
            только значком — подпись уходит в `aria-label` для скринридера, а
            у «Архива» и «Пригласить» текст возвращается рядом со значком от
            sm и шире, где место уже не в обрез. «По дате» и «По важности» —
            сама суть переключателя вида, их текст не прячем ни на одном
            размере экрана.

            Прикидка ширины на 360 точек (контентная область экрана — 328 при
            паддинге страницы 16 с каждой стороны): три значка по 40
            (минимальная область нажатия) — 120, «По дате» (текст без иконки,
            паддинг 2.5×2) — около 74, «По важности» — около 104, четыре
            зазора gap-1.5 между пятью кнопками — 24. Итого около 322 из
            328 — укладывается, но впритык (запас ~6px, оценка ширины текста
            приближённая); `flex-wrap` на контейнере оставлен как сетка
            безопасности на случай более узкого экрана или крупного шрифта в
            настройках браузера.

            Ряд занимает строку целиком (`w-full`) и прижат влево — значит,
            его левый край всегда совпадает с левым краем поля поиска под ним
            (VED-280). Раньше стояли `ml-auto` и `justify-end`: на широком
            экране ряд уезжал в правый конец строки с названием, а на телефоне
            переносился вниз, но оставался прижатым вправо — и край расходился
            с поиском тем сильнее, чем уже экран (на 375 точках — на 27
            пикселей, на 320 — на 18). Прижимать вправо и одновременно ровнять
            по левому краю нельзя, поэтому ряд прижат влево на всех ширинах:
            одно правило вместо разъезжающихся по брейкпоинтам. */}
        <div className="flex w-full flex-wrap items-center justify-start gap-1.5">
          {/* Только на телефоне, как и стрелки у колонок: шире sm колонки
              стоят в ряд, прятать их незачем. Одна кнопка, меняющая смысл, а
              не пара рядом: вторая всегда была бы бесполезной, а место
              занимала бы то же. Кнопка всегда значковая — на этой ширине
              экрана текст рядом с ней никогда не появляется, полю подписи
              взяться неоткуда. */}
          {board.columns.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              aria-expanded={!allFolded}
              aria-label={
                allFolded ? "Развернуть все разделы" : "Свернуть все разделы"
              }
              title={
                allFolded ? "Развернуть все разделы" : "Свернуть все разделы"
              }
              className={workToolbarButtonClass({ extra: "sm:hidden" })}
            >
              {allFolded ? (
                <ChevronDown aria-hidden className="size-4" />
              ) : (
                <ChevronUp aria-hidden className="size-4" />
              )}
            </button>
          )}
          {/* Группировка по дате создания (VED-160) и по важности (VED-51).
              Одна пара кнопок на один режим: включив одну, вторая гаснет —
              вместе они не имеют смысла. Нажатое состояние видно не только
              рамкой — его называет `aria-pressed`. «По дате» стоит первой —
              так попросил тестировщик. */}
          <button
            type="button"
            aria-pressed={groupMode === "date"}
            onClick={() => toggleGroupMode("date")}
            title={
              groupMode === "date"
                ? "Карточки собраны по дате создания; перетаскивание пока выключено"
                : "Собрать карточки раздела по дате создания: новые сверху"
            }
            className={workToolbarButtonClass({ pressed: groupMode === "date" })}
          >
            По дате
          </button>
          {/* «По правке» (VED-421) — сразу после «По дате», как просил
              заказчик: задачи по времени создания и последней правки,
              свежетронутые сверху. */}
          <button
            type="button"
            aria-pressed={groupMode === "edited"}
            onClick={() => toggleGroupMode("edited")}
            title={
              groupMode === "edited"
                ? "Карточки собраны по последней правке; перетаскивание пока выключено"
                : "Собрать карточки раздела по последней правке: свежетронутые сверху"
            }
            className={workToolbarButtonClass({
              pressed: groupMode === "edited",
            })}
          >
            По правке
          </button>
          <button
            type="button"
            aria-pressed={groupMode === "priority"}
            onClick={() => toggleGroupMode("priority")}
            title={
              groupMode === "priority"
                ? "Карточки собраны по важности; перетаскивание пока выключено"
                : "Собрать карточки раздела по важности: горящее сверху"
            }
            className={workToolbarButtonClass({
              pressed: groupMode === "priority",
            })}
          >
            По важности
          </button>
          <button
            type="button"
            onClick={() => setArchiveOpen(true)}
            aria-label="Архив"
            title="Архив"
            className={workToolbarButtonClass()}
          >
            <Archive aria-hidden className="size-4 shrink-0" />
            <span className="hidden sm:inline">Архив</span>
          </button>
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
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 sm:max-w-sm">
            <p
              role="status"
              className="flex w-full items-center gap-2 text-xs text-text-1"
            >
              {searchSummary(found, countTasks(board))}
              {/* Показана вся доска — сказать, где искать найденное. */}
              {revealAll && found > 0 && " — отмечены «Найдено»"}
              {searching && (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              )}
            </p>
            {/* Две кнопки вместо одной с меняющейся подписью (VED-417):
                «Показать найденные» слева, «Показать все» справа. Нажатая
                видна рамкой и `aria-pressed`. «Показать все» по-прежнему не
                сбрасывает поиск (VED-131): запрос остаётся в поле, найденное
                выделено. Сбросить поиск — крестик в поле или Escape. */}
            <button
              type="button"
              aria-pressed={!revealAll}
              onClick={() => setRevealAll(false)}
              className={workToolbarButtonClass({
                pressed: !revealAll,
                extra: "min-h-11",
              })}
            >
              {SEARCH_SHOW_FOUND}
            </button>
            <button
              type="button"
              aria-pressed={revealAll}
              onClick={() => setRevealAll(true)}
              className={workToolbarButtonClass({
                pressed: revealAll,
                extra: "ml-auto min-h-11",
              })}
            >
              {SEARCH_SHOW_ALL}
            </button>
          </div>
        )}
      </div>

      {/* Папка «Чужие» (VED-320). Кнопка, а не третья вкладка вида: это не
          способ разложить доску, а место, куда убрано не своё, — «зайдя
          туда». Подпись рядом объясняет, почему карточек меньше, чем было:
          без неё спрятанное читалось бы как пропажа. */}
      {foreignTotal > 0 && !searchActive && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            aria-pressed={inForeign}
            onClick={() => setFolder(inForeign ? "mine" : "foreign")}
            className={workToolbarButtonClass({
              pressed: inForeign,
              extra: "min-h-11",
            })}
          >
            {inForeign ? (
              <FolderOpen aria-hidden className="size-4 shrink-0" />
            ) : (
              <FolderClosed aria-hidden className="size-4 shrink-0" />
            )}
            {/* Пробел — для скринридера: без него имя кнопки читается
                слитно, «Чужие4». Во флексе он места не занимает. */}
            Чужие{" "}
            <span className="font-mono">{foreignTotal}</span>
          </button>
          <p className="min-w-0 flex-1 text-xs text-text-1">
            {foreignFolderHint(foreignTotal, activeFolder)}
            {inForeign && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setFolder("mine")}
                  className="min-h-11 font-semibold text-text-0 underline underline-offset-2"
                >
                  К своим задачам
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {/* Сказать про выключенное перетаскивание словами: иначе карточка,
          которая перестала браться пальцем, читается как поломка. */}
      {groupMode === "priority" && (
        <p className="mb-3 text-xs text-text-2">
          Карточки собраны по важности. Перетаскивание пока выключено — порядок
          внутри раздела задаёт важность; перенести карточку в соседний раздел
          можно стрелками на ней.
        </p>
      )}
      {groupMode === "date" && (
        <p className="mb-3 text-xs text-text-2">
          Карточки собраны по дате создания: новые сверху. Перетаскивание пока
          выключено — порядок внутри раздела задаёт время создания; перенести
          карточку в соседний раздел можно стрелками на ней.
        </p>
      )}
      {groupMode === "edited" && (
        <p className="mb-3 text-xs text-text-2">
          Карточки собраны по последней правке: сверху те, что завели или
          меняли недавно, — поля, перенос, комментарий, чек-лист, вложения.
          Перетаскивание пока выключено; перенести карточку в соседний раздел
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
          // Место внутри своей группы — разделов или статусов (VED-430):
          // стрелки «раньше/позже» у заголовка ходят только по ней.
          const group = columnGroupOf(board.columns, column.id);
          const index = group.findIndex((item) => item.id === column.id);
          const over = isOverWip(full);
          const columnMatches = searchActive
            ? countMatches(full.tasks, matches)
            : 0;
          // Свёрнутая колонка прятала бы найденное: на время поиска колонки
          // с совпадениями раскрыты, остальные — как их оставили.
          const folded = isColumnFolded({
            collapsed,
            columnId: column.id,
            searchActive,
            hasMatches: columnMatches > 0,
          });
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
              draggable={!searchActive && groupMode === "none" && !inForeign}
              found={searchActive && revealAll && matches.has(task.id)}
              // Задача в статусе говорит, о чём она (VED-430): «РАБОТА».
              sectionName={
                isStatusColumn(full) && task.sectionId
                  ? (sectionNames.get(task.sectionId) ?? null)
                  : null
              }
              onOpen={() => setOpenTaskId(task.id)}
              onHandleDown={(event) => onHandleDown(event, task.id)}
              onHandleMove={onHandleMove}
              onHandleUp={onHandleUp}
              onMoveBeside={(direction) => moveBeside(task, direction)}
              onToggleViewed={() => void toggleViewed(task.id, !task.viewed)}
              cardRef={(element) => {
                if (element) cardRefs.current.set(task.id, element);
                else cardRefs.current.delete(task.id);
              }}
            />
          );
          const section = (
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
                  // min-w-0 и перенос: на 320 точках длинное название
                  // («ВДОХНОВЕНИЕ.») вместе со счётчиком «1 из 5» и кнопками
                  // выталкивало карандаш за край экрана — страница ехала вбок.
                  <h2 className="min-w-0 text-sm font-semibold text-text-0 [overflow-wrap:anywhere]">
                    {column.name}
                  </h2>
                )}
                <span
                  className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
                    over ? "bg-gold/20 text-gold" : "text-text-2"
                  }`}
                  title={
                    column.wipLimit > 0
                      ? `Лимит раздела: ${column.wipLimit}`
                      : undefined
                  }
                >
                  {searchActive
                    ? `${columnMatches} из ${full.tasks.length}`
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
                      disabled={index === group.length - 1}
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
                {/* В папке «Чужие» новую задачу не заводят: заведённая
                    своя туда и не попала бы. */}
                {canEdit &&
                  !inForeign &&
                  (composerColumn === column.id ? (
                    <form
                      className="mb-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addTask(column.id);
                      }}
                    >
                      {/* Поле — описание, а не название (VED-324). Enter без
                          Shift больше не отправляет: в описание пишут
                          абзацами, и отправка по Enter обрывала бы его на
                          первой же мысли. Отправляют кнопкой и Ctrl/⌘+Enter. */}
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            (event.metaKey || event.ctrlKey)
                          ) {
                            event.preventDefault();
                            void addTask(column.id);
                          }
                          if (event.key === "Escape") setComposerColumn(null);
                        }}
                        rows={4}
                        maxLength={2000}
                        placeholder="Опишите задачу: что не так, где и что должно быть"
                        aria-label={`Описание новой задачи в разделе «${column.name}»`}
                        className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
                      />
                      {/* Что станет заголовком — видно до отправки, и правится
                          на месте. Молча собранный заголовок человек искал бы
                          глазами на доске и не понимал, откуда он взялся.

                          Переносится `overflow-wrap: anywhere`, а не
                          `break-all`: в заголовок попадает то, что написал
                          человек, и сплошная строка без пробелов не должна
                          вылезать за край колонки — но обычные слова от
                          `break-all` рвались посередине («открывает о/кно»). */}
                      {draft.trim() && draftTitle === null && (
                        <p className="mt-1 flex flex-wrap items-baseline gap-1 text-xs text-text-2">
                          <span>Заголовок:</span>
                          <span className="text-text-1 [overflow-wrap:anywhere]">
                            «{autoTitle}»
                          </span>
                          {/* py-1 не для красоты: без него цель нажатия 16px
                              высотой, а WCAG 2.2 просит 24 (SC 2.5.8). */}
                          <button
                            type="button"
                            ref={editTitleRef}
                            onClick={() => setDraftTitle(autoTitle)}
                            className="py-1 font-semibold text-text-1 underline"
                          >
                            Изменить
                          </button>
                        </p>
                      )}
                      {draftTitle !== null && (
                        // Кнопка — рядом с `label`, а не внутри: подпись поля
                        // прочиталась бы вместе с её текстом, а нажатие на
                        // подпись уводило бы фокус в поле мимо кнопки.
                        <div className="mt-1">
                          <label className="block text-xs text-text-1">
                            Заголовок
                            {/* Фокус сразу в поле: правку открыли нажатием
                                кнопки, которая от этого исчезла. Поле
                                появляется только по этому нажатию, поэтому
                                `autoFocus` ничего не перехватывает. */}
                            <input
                              autoFocus
                              value={draftTitle}
                              onChange={(event) =>
                                setDraftTitle(event.target.value)
                              }
                              maxLength={200}
                              className="mt-1 block w-full rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              returnFocusToEditTitle.current = true;
                              setDraftTitle(null);
                            }}
                            className="mt-1 py-1 text-xs text-text-2 underline"
                          >
                            Собрать из описания
                          </button>
                        </div>
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
                      {/* Скриншоты прикладываются здесь же (VED-324): ради
                          них и приходилось заходить в только что заведённую
                          карточку. Уйдут сразу после её создания — сервер
                          принимает вложения только к существующей задаче. */}
                      <label className="mt-2 block text-xs text-text-1">
                        Скриншоты и файлы
                        <input
                          type="file"
                          multiple
                          /* Ключ по числу файлов: после отправки список
                             очищается, поле пересоздаётся и перестаёт
                             показывать имя уже приложенного файла. */
                          key={draftFiles.length === 0 ? "empty" : "picked"}
                          onChange={(event) =>
                            setDraftFiles(
                              Array.from(event.target.files ?? []).slice(
                                0,
                                MAX_FILES_AT_ONCE,
                              ),
                            )
                          }
                          className="mt-1 block w-full text-xs text-text-2 file:mr-2 file:rounded-lg file:border file:border-glass-brd file:bg-bg-1 file:px-2 file:py-1 file:text-xs file:text-text-1"
                        />
                      </label>
                      {draftFiles.length > 0 && (
                        <p className="mt-1 text-xs text-text-2">
                          Приложится{" "}
                          {draftFiles.map((file) => file.name).join(", ")}
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="submit"
                          disabled={saving}
                          className="rounded-lg bg-magenta px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {saving ? "Добавляем…" : "Добавить"}
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
                    важности или по дате создания: горящее/свежее сверху,
                    пустые группы не занимают строку. Подпись группы —
                    заголовок третьего уровня под названием раздела:
                    скринридер должен слышать вложенность, а не ровный ряд
                    карточек. */}
                {groupMode === "priority" ? (
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
                ) : groupMode === "date" || groupMode === "edited" ? (
                  <div className="flex min-h-[40px] flex-col gap-3">
                    {(groupMode === "edited"
                      ? groupTasksByEditedDate(column.tasks, now)
                      : groupTasksByCreatedDate(column.tasks, now)
                    ).map((dateGroup) => (
                      <div key={dateGroup.bucket}>
                        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-2">
                          {groupMode === "edited" ? (
                            <Pencil aria-hidden className="size-3.5" />
                          ) : (
                            <History aria-hidden className="size-3.5" />
                          )}
                          {dateGroup.title}
                          <span className="font-normal">
                            {dateGroup.tasks.length}
                          </span>
                        </h3>
                        <ul className="flex flex-col gap-2">
                          {dateGroup.tasks.map((task) => (
                            <li key={task.id}>{renderCard(task)}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
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
          /* Граница групп (VED-430): перед первой колонкой статуса — подпись
             «Статусы». Не заголовок: названия колонок — h2, и лишний уровень
             ломал бы их порядок для скринридера. */
          if (column.id !== firstStatusId) return section;
          return [
            <div
              key="status-divider"
              className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-text-1 sm:flex-col sm:justify-center sm:px-1 sm:pt-0"
            >
              <span
                aria-hidden
                className="h-px flex-1 bg-glass-brd sm:h-auto sm:w-px"
              />
              <span className="sm:[writing-mode:vertical-rl]">Статусы</span>
              <span
                aria-hidden
                className="h-px flex-1 bg-glass-brd sm:h-auto sm:w-px"
              />
            </div>,
            section,
          ];
        })}

        {canManage &&
          !searchActive &&
          !inForeign &&
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
  found = false,
  sectionName = null,
  onOpen,
  onHandleDown,
  onHandleMove,
  onHandleUp,
  onMoveBeside,
  onToggleViewed,
  cardRef,
}: {
  task: WorkTaskCardDto;
  dragging: boolean;
  canEdit: boolean;
  draggable: boolean;
  /** Совпала с поиском, а на доске показано всё (VED-131) — выделить. */
  found?: boolean;
  /** Раздел задачи, стоящей в колонке статуса (VED-430). */
  sectionName?: string | null;
  onOpen: () => void;
  onHandleDown: (event: React.PointerEvent) => void;
  onHandleMove: (event: React.PointerEvent) => void;
  onHandleUp: (event: React.PointerEvent) => void;
  onMoveBeside: (direction: -1 | 1) => void;
  onToggleViewed: () => void;
  cardRef: (element: HTMLElement | null) => void;
}) {
  const overdue =
    task.dueAt !== null &&
    !task.completedAt &&
    new Date(task.dueAt) < new Date();
  const mark = priorityMark(task.priority);
  const handle = canEdit && draggable;

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border border-glass-brd bg-bg-1 px-2 py-1.5 transition-opacity ${
        mark?.edge ?? ""
      } ${found ? "ring-2 ring-gold" : ""} ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1">
        {handle && (
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
          <span className="block text-sm leading-snug text-text-0">
            {task.title}
          </span>
        </button>
      </div>

      {/* Одна строка сведений и действий (VED-431, VED-418): раньше под
          названием шли три строки — номер со счётчиками, имя исполнителя
          отдельной строкой справа и ещё строка со стрелками и «Просмотрено».
          Заказчик: «много пустых мест», «перемести эти кнопки в направлении
          стрелки» — вправо, в строку с номером. Стрелки и «Просмотрено»
          прижаты вправо и переносятся под сведения, только если в строке им
          не хватило места. */}
      <div
        className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-2 ${
          handle ? "pl-5" : ""
        }`}
      >
        <span className="font-mono">{task.key}</span>
        {/* Состояние — сразу за номером (VED-311): «в каком состоянии задача»
            человек спрашивает первым. У чужой задачи — «Чужое» вместо
            состояния (VED-320). */}
        <StatusMarkBadge mark={taskMark(task)} />
        {/* Раздел задачи, уехавшей в статус (VED-430): в «Тестеровании»
            видно, что она из «РАБОТЫ». */}
        {sectionName && (
          <span
            title={`Раздел: ${sectionName}`}
            className="max-w-[9rem] truncate rounded-full bg-glass px-1.5 py-0.5 text-[10px] text-text-1"
          >
            <span className="sr-only">Раздел: </span>
            {sectionName}
          </span>
        )}
        {/* Находка среди всей доски (VED-131): рамка и слово. Слово цветом
            `text-1`, краска — только на обводке: у золота на светлой теме
            3,66:1, для подписи мало. */}
        {found && (
          <span className="rounded-full border border-gold/60 px-1.5 py-0.5 text-[10px] font-medium text-text-1">
            Найдено
          </span>
        )}
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
            <span className="sr-only">Срок: </span>
            {new Date(task.dueAt).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
        {task.checklistTotal > 0 && (
          <span className="flex items-center gap-1">
            <ListChecks aria-hidden className="size-3.5" />
            <span className="sr-only">Чек-лист: </span>
            {task.checklistDone}/{task.checklistTotal}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare aria-hidden className="size-3.5" />
            <span className="sr-only">Комментарии: </span>
            {task.commentCount}
          </span>
        )}
        {/* Скрепка — к карточке приложены скриншоты или файлы (VED-431). */}
        {task.attachmentCount > 0 && (
          <span
            className="flex items-center gap-1"
            title={`Вложения: ${task.attachmentCount}`}
          >
            <Paperclip aria-hidden className="size-3.5" />
            <span className="sr-only">Вложения: </span>
            {task.attachmentCount}
          </span>
        )}
        {/* Исполнитель — первым словом имени, в той же строке (VED-431):
            полное имя справа занимало на телефоне отдельную строку. Полное —
            в подсказке и для скринридера. */}
        {task.assignee && (
          <span
            title={`Исполнитель: ${workPersonLabel(task.assignee)}`}
            className="max-w-[8rem] truncate text-text-1"
          >
            <span className="sr-only">
              Исполнитель: {workPersonLabel(task.assignee)}
            </span>
            <span aria-hidden>{workPersonShortLabel(task.assignee)}</span>
          </span>
        )}

        <span className="ml-auto flex items-center gap-0.5">
          {canEdit && (
            // Клавиатурный путь к переносу. Перетаскивание мышью и пальцем
            // работает, но им нельзя пользоваться с клавиатуры, а доска без
            // переноса бесполезна — поэтому кнопки видны всегда.
            //
            // «Предыдущая» и «следующая», а не «слева» и «справа»: на
            // телефоне колонки стоят столбиком, и «слева» там показывало бы
            // вверх. Стрелка разворачивается вслед за раскладкой.
            <>
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
            </>
          )}
          {/* «Просмотрено» — своя отметка, у каждого своя (VED-365). Гаснет
              сама, когда задачу после этого переносит или комментирует
              другой. `aria-pressed` говорит скринридеру, отмечено ли, а
              галочка — глазам. Пилюля маленькая, а цель нажатия — 44px по
              высоте: отрицательные поля не раздувают строку. */}
          <button
            type="button"
            aria-pressed={task.viewed}
            onClick={onToggleViewed}
            aria-label={`Просмотрено: «${task.title}»`}
            title={
              task.viewed
                ? "Вы отметили задачу просмотренной. Нажмите, чтобы снять отметку"
                : "Отметить задачу просмотренной"
            }
            className="group -my-2.5 ml-1 inline-flex min-h-11 items-center py-2.5"
          >
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                task.viewed
                  ? "border-cyan bg-glass text-text-0"
                  : "border-text-2/60 text-text-1 group-hover:text-text-0"
              }`}
            >
              {task.viewed && <Check aria-hidden className="size-3" />}
              Просмотрено
            </span>
          </button>
        </span>
      </div>
    </div>
  );
}
