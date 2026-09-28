"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { FileText, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { WORK_CHECKLIST_TEXT_MAX } from "@vedamatch/shared";
import { CompactSoundButton } from "@/components/quick/compact-sound-button";
import type {
  WorkBoardDto,
  WorkTaskDto,
  WorkTaskPriority,
} from "@vedamatch/shared";
import {
  addWorkChecklistItem,
  archiveWorkTask,
  removeWorkAttachment,
  commentWorkTask,
  deleteWorkTaskForever,
  getWorkTask,
  moveWorkTask,
  removeWorkChecklistItem,
  restoreWorkTask,
  updateWorkChecklistItem,
  updateWorkTask,
} from "@/lib/work-api";
import {
  WORK_ATTACH_PICKER_CLASS,
  WORK_ATTACH_REMOVE_CLASS,
} from "./attach-button";
import type { AttachOutcome, WorkUploadJob } from "./upload-queue";
import { workUploads } from "./work-uploads";
import { isLongChecklistText } from "./checklist-text";
import {
  chooseSection,
  chooseStatus,
  placeStatusId,
  splitColumnsByKind,
} from "./task-section";
import { workPersonLabel } from "./person-label";
import { PRIORITY_TITLE } from "./task-priority";
import { formatTaskDate } from "./task-date";
import {
  draftFromTask,
  pendingTaskEdits,
  taskEditsProblem,
  type TaskDraft,
} from "./task-edits";
import {
  createTaskPlacer,
  hasFormEdits,
  pendingFormEdits,
  placeOf,
  withPlace,
  type PlaceOutcome,
  type TaskPlace,
} from "./task-place";
import { WorkTaskFinance } from "./task-finance";
import {
  browserSessionStore,
  patchBoardSession,
  readBoardSession,
  without,
} from "./board-session";

/**
 * Открытые окна задач (VED-608): вложения уходят через очередь портала и
 * переживают закрытие окна и переход в другое окно портала. Итог загрузки
 * забирает окно, открытое на этой задаче сейчас, — даже если это уже другое
 * окно, открытое заново. Нет такого — итог сообщает индикатор портала.
 */
const openTaskDialogs = new Map<
  string,
  (outcome: AttachOutcome<WorkTaskDto>) => void
>();

const NO_UPLOADS: readonly WorkUploadJob[] = [];

/**
 * Раздел и статус (VED-611) уходят очередью вне окна: закрыли окно, ушли в
 * другое окно портала — запрос летит дальше; `keepalive` доносит его, даже
 * если закрыли вкладку или приложение. Обёртки, а не сами функции: запрос
 * берётся в момент вызова.
 */
const taskPlacer = createTaskPlacer<WorkTaskDto>({
  update: (taskId, body) => updateWorkTask(taskId, body, { keepalive: true }),
  move: (taskId, body) => moveWorkTask(taskId, body, { keepalive: true }),
});

/** Окна, открытые на задаче сейчас, — им итог выбора места. */
const openTaskPlaces = new Map<
  string,
  (outcome: PlaceOutcome<WorkTaskDto>) => void
>();

/** Поле карточки: одинаковое у всех списков и у срока. */
const FIELD_CLASS =
  "mt-1 block w-full min-w-0 rounded-xl border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0";

/** Вид текста пункта чек-листа: зачёркнут, если выполнен; свёрнут до трёх строк. */
function checklistTextClass(done: boolean, clamped: boolean): string {
  return `whitespace-pre-wrap text-sm [overflow-wrap:anywhere] ${
    done ? "text-text-2 line-through" : "text-text-0"
  } ${clamped ? "line-clamp-3" : "block"}`;
}

/** Высота поля под текст: длинное название видно целиком, а не первой строкой. */
function growToText(element: HTMLTextAreaElement): void {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
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
  /**
   * Карточка, как её знает сервер, — без выбранного, но ещё не дошедшего
   * места (VED-611). От неё очередь считает, что отправить.
   */
  const confirmedTask = useRef<WorkTaskDto | null>(null);
  /** Показать карточку от сервера; место, которое ещё летит, — поверх. */
  const showTask = useCallback((next: WorkTaskDto) => {
    confirmedTask.current = next;
    const pending = taskPlacer.pendingPlace(next.id);
    setTask(pending ? withPlace(next, pending) : next);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Черновик полей карточки (VED-56): название, описание, исполнитель,
     важность и срок. Раздел и статус в него не входят — уходят сразу
     (VED-611), место в черновике всегда то, что на карточке. Остальное
     сохраняет кнопка «Сохранить» или закрытие окна — ни потеря фокуса, ни
     выбор в списке на сервер сами не уходят, иначе кнопка после такой
     правки не появлялась. */
  const [draft, setDraft] = useState<TaskDraft>({
    title: "",
    description: "",
    columnId: "",
    sectionId: null,
    assigneeId: null,
    priority: "normal",
    due: "",
  });
  /*
    Название и описание держат текст сами (VED-453): набранная буква
    перерисовывает только своё поле, а не всё окно с чек-листом, вложениями
    и обсуждением. На телефоне полная перерисовка на каждое нажатие
    отставала от пальцев, и клавиатура склеивала слова. Черновик догоняет
    поле переходом (startTransition) — его можно прервать следующей буквой,
    — а свежий текст для сохранения и закрытия лежит здесь, без задержки.
  */
  const latestText = useRef({ title: "", description: "" });
  /** Смена ключа заново заводит поля текста — после загрузки, сохранения и отмены. */
  const [textKey, setTextKey] = useState(0);
  /** Смена ключа заводит заново только заголовок — после ✖ (VED-488). */
  const [titleKey, setTitleKey] = useState(0);
  /** Пункт чек-листа, который правят на месте (VED-524). */
  const [editingItem, setEditingItem] = useState<string | null>(null);
  /** Кнопка-текст пункта, куда вернуть фокус после правки (VED-603): поле
   *  исчезает, и без этого фокус падал бы на `body`. */
  const itemTextButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusItemAfterEdit = useRef<string | null>(null);
  useEffect(() => {
    if (editingItem !== null || !focusItemAfterEdit.current) return;
    itemTextButtons.current.get(focusItemAfterEdit.current)?.focus();
    focusItemAfterEdit.current = null;
  }, [editingItem]);
  function finishItemEdit(itemId: string) {
    focusItemAfterEdit.current = itemId;
    setEditingItem(null);
  }
  /** Какие длинные пункты чек-листа раскрыты кнопкой «Далее» (VED-375). */
  const [expandedItems, setExpandedItems] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Только что сохранили — показать «Сохранено», пока снова не начали править.
   *  Ставят кнопка «Сохранить» и правки со своей кнопкой (текст и пункты
   *  чек-листа, комментарий): они уходят сразу, и об этом тоже надо сказать.
   *  Галочка чек-листа (VED-603), статус и раздел (VED-611), скриншоты
   *  (VED-518, у них своя индикация загрузки) — нет. */
  const [justSaved, setJustSaved] = useState(false);
  /** Идёт загрузка вложений к этой задаче: сколько ушло из скольких. Из
   *  очереди портала (VED-608), поэтому видна и в заново открытом окне. */
  const uploadJobs = useSyncExternalStore(
    workUploads.subscribe,
    workUploads.getSnapshot,
    () => NO_UPLOADS,
  );
  const uploadJob = uploadJobs.find(
    (job) => job.taskId === taskId && job.phase === "uploading",
  );
  const uploading = uploadJob
    ? { done: uploadJob.done, total: uploadJob.total }
    : null;
  /** Итог загрузки — в это окно, пока оно открыто. */
  const takeUploadOutcome = useRef<
    (outcome: AttachOutcome<WorkTaskDto>) => void
  >(() => {});
  takeUploadOutcome.current = (outcome) => {
    if (outcome.last) showTask(outcome.last);
    // Успех «Сохранено» не показывает (VED-518): у скриншотов своя
    // индикация — «Загружаю N из M» и итог в очереди загрузок (VED-608).
    void Promise.resolve(onChanged()).then(() => {
      if (outcome.problem) setError(outcome.problem);
    });
  };
  useEffect(() => {
    const take = (outcome: AttachOutcome<WorkTaskDto>) =>
      takeUploadOutcome.current(outcome);
    openTaskDialogs.set(taskId, take);
    return () => {
      if (openTaskDialogs.get(taskId) === take) openTaskDialogs.delete(taskId);
    };
  }, [taskId]);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  const canEdit =
    board.role === "owner" || board.role === "admin" || board.role === "member";
  /* Стереть карточку насовсем может тот, кто отвечает за среду (VED-6):
     участнику остаётся архив, откуда карточку ещё можно вернуть. */
  const canManage = board.role === "owner" || board.role === "admin";

  // Ответ применяется только пока карточка открыта: закрыли её и открыли
  // соседнюю — прилетевший ответ первой не должен подменить вторую.
  useEffect(() => {
    let alive = true;
    getWorkTask(taskId)
      .then((loaded) => {
        if (!alive) return;
        showTask(loaded);
        // Правки, не сохранённые до ухода в другое окно портала (VED-520),
        // возвращаются в поля — с кнопкой «Сохранить», как были. Место — с
        // карточки: оно в черновик не входит (VED-611).
        const kept = readBoardSession(browserSessionStore(), board.id)
          .taskDrafts[loaded.id];
        const fresh = draftFromTask(loaded);
        resetDraft(kept ? withPlace(kept, placeOf(fresh)) : fresh);
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
  }, [taskId, board.id, showTask]);

  // Высоту заголовка считаем после загрузки: до неё в поле пусто и оно
  // осталось бы в одну строку.
  useEffect(() => {
    if (titleRef.current) growToText(titleRef.current);
  }, [textKey]);

  // ✖ стёр заголовок — поле заведено заново пустым, курсор сразу в нём:
  // человек нажал крестик, чтобы писать свой.
  useEffect(() => {
    if (titleKey === 0 || !titleRef.current) return;
    growToText(titleRef.current);
    titleRef.current.focus();
  }, [titleKey]);

  /** ✖ в заголовке (VED-488): стереть одним нажатием, описание не трогать. */
  function clearTitle() {
    editText("title", "");
    setTitleKey((key) => key + 1);
  }

  const saved = task ? draftFromTask(task) : draft;
  /* Место (раздел и статус) не делает черновик «грязным» (VED-611): оно
     уходит само, и «Сохранить» из-за него не появляется. */
  const dirty = Boolean(task) && hasFormEdits(saved, draft);
  /** Полоса «Сохранить / Сохранено» внизу окна (VED-56, VED-518). */
  const saveBar = canEdit && (dirty || justSaved);

  // Несохранённое — в память вкладки (VED-520): уход в другое окно портала
  // снимает окно карточки, и без этого правка пропадала. Сохранили или
  // отменили — запись стирается.
  useEffect(() => {
    if (!task) return;
    const next = { ...draft, ...latestText.current };
    const unsaved = hasFormEdits(draftFromTask(task), next);
    patchBoardSession(browserSessionStore(), board.id, (session) => ({
      ...session,
      taskDrafts: unsaved
        ? { ...session.taskDrafts, [task.id]: next }
        : without(session.taskDrafts, task.id),
    }));
  }, [task, draft, board.id]);
  const problem = taskEditsProblem(draft);

  /**
   * Отправить черновик: поля карточки одним запросом, перенос — своим, он
   * рождает уведомление о смене статуса. Возвращает карточку после последнего
   * запроса; `null` — отправлять было нечего.
   */
  const commit = useCallback(
    async (base: WorkTaskDto, next: TaskDraft): Promise<WorkTaskDto | null> => {
      const pending = pendingTaskEdits(draftFromTask(base), next);
      if (!pending) return null;
      let latest = base;
      if (pending.update) {
        latest = await updateWorkTask(base.id, pending.update);
        // Поля уже на сервере: если следом не пройдёт перенос, окно не должно
        // показывать их несохранёнными.
        showTask(latest);
      }
      if (pending.columnId) {
        latest = await moveWorkTask(base.id, {
          columnId: pending.columnId,
          // Раздел, выбранный вместе со статусом (VED-430), едет с переносом.
          ...(pending.moveSectionId !== undefined
            ? { sectionColumnId: pending.moveSectionId }
            : {}),
        });
      }
      return latest;
    },
    [showTask],
  );

  /**
   * Закрыть окно, не потеряв правок: несохранённое уходит на сервер. Раньше
   * Escape прямо из поля закрывал окно раньше, чем поле теряло фокус, и
   * правка пропадала.
   */
  const requestClose = useCallback(() => {
    // Место в черновик не входит (VED-611): оно уже ушло своей очередью.
    const next = task
      ? withPlace({ ...draft, ...latestText.current }, placeOf(task))
      : { ...draft, ...latestText.current };
    if (task && canEdit && pendingFormEdits(draftFromTask(task), next)) {
      void commit(task, next)
        .then(() => onChanged())
        .catch(() => undefined);
    }
    // Правки ушли на сервер вместе с закрытием — черновик больше не нужен.
    if (task) {
      patchBoardSession(browserSessionStore(), board.id, (session) => ({
        ...session,
        taskDrafts: without(session.taskDrafts, task.id),
      }));
    }
    onClose();
  }, [task, canEdit, draft, commit, onChanged, onClose, board.id]);

  // Escape закрывает окно: без этого на компьютере из карточки выходят мышью,
  // а с клавиатуры — никак.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  /**
   * Любое действие карточки идёт через одну обёртку.
   *
   * Раньше ошибку показывала только правка полей, а отправка комментария,
   * чек-лист, перенос и архив падали молча: отказ сервера (истёкшая сессия,
   * лимит запросов, потерянные права) выглядел как «кнопка не нажимается».
   * Заодно `busy` не даёт отправить второй раз, пока летит первый.
   */
  async function run(
    action: () => Promise<WorkTaskDto | void>,
    { announce = true }: { announce?: boolean } = {},
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) showTask(next);
      await onChanged();
      // Дошло — окно так и говорит. Правок в черновике это не касается: пока
      // они есть, полоса показывает их, а не «Сохранено». Действия-щелчки
      // (галочка чек-листа, VED-603) полосу не вызывают: как статус и
      // раздел (VED-611), они видны сами по себе.
      if (announce) setJustSaved(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не сохранилось");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Закрыть окно после сохранения (VED-400): «после нажатия кнопки
   * Сохранить окно редакции задачи должно закрываться». Правок не осталось,
   * черновик на доске больше не нужен.
   */
  function closeSaved() {
    if (task) {
      patchBoardSession(browserSessionStore(), board.id, (session) => ({
        ...session,
        taskDrafts: without(session.taskDrafts, task.id),
      }));
    }
    onClose();
  }

  /**
   * Вложения по одному запросу на файл, по очереди (VED-112). Если какой-то
   * не приложился, остальные остаются в карточке, а ошибка называет его по
   * имени. Уходят через очередь портала (VED-608): окно можно закрыть и уйти
   * в другое окно портала — загрузка продолжится, а итог покажет индикатор.
   */
  function attachFiles(files: File[]) {
    if (files.length === 0 || !task) return;
    setError(null);
    // «Загружаю…» — в тот же кадр, что и выбор файла: задание встаёт в
    // очередь синхронно, до первого ответа сервера.
    void workUploads
      .attach({
        boardId: board.id,
        taskId,
        taskKey: task.key,
        title: task.title,
        files,
        boardHref: `/work/planner/${board.spaceId}`,
        watcher: { watching: () => openTaskDialogs.has(taskId) },
      })
      .then((outcome) => openTaskDialogs.get(taskId)?.(outcome));
  }

  function edit(next: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...next }));
    setJustSaved(false);
  }

  function editText(field: "title" | "description", value: string) {
    latestText.current = { ...latestText.current, [field]: value };
    startTransition(() => edit({ [field]: value }));
  }

  /** Подставить черновик извне: поля текста заводятся заново, только если текст в них другой. */
  function resetDraft(next: TaskDraft) {
    const changed =
      next.title !== latestText.current.title ||
      next.description !== latestText.current.description;
    latestText.current = { title: next.title, description: next.description };
    setDraft(next);
    if (changed) setTextKey((key) => key + 1);
  }

  /** Итог выбора места — в это окно, пока оно открыто (VED-611). */
  const takePlaceOutcome = useRef<
    (outcome: PlaceOutcome<WorkTaskDto>) => void
  >(() => {});
  takePlaceOutcome.current = (outcome) => {
    if (outcome.last) {
      // Последний выбор дошёл — карточка как на сервере; не дошёл — место
      // откатывается к тому, что на сервере.
      showTask(outcome.task);
    } else {
      confirmedTask.current = outcome.task;
    }
    if (outcome.problem) {
      setError(`Раздел или статус не сохранились: ${outcome.problem}`);
    }
  };
  useEffect(() => {
    const take = (outcome: PlaceOutcome<WorkTaskDto>) =>
      takePlaceOutcome.current(outcome);
    openTaskPlaces.set(taskId, take);
    return () => {
      if (openTaskPlaces.get(taskId) === take) openTaskPlaces.delete(taskId);
    };
  }, [taskId]);

  /**
   * Раздел и статус уходят сразу, без «Сохранить» (VED-526, VED-611):
   * перенос — действие, как галочка в чек-листе, а не правка текста.
   * Оптимистично: список показывает выбор тут же, а при отказе сервера место
   * откатывается и окно говорит почему. Ни черновик, ни «Сохранить», ни
   * «Сохранено» выбор не трогает, окно не блокирует. Запрос — очередью вне
   * окна (`taskPlacer`): закрытие окна или уход со страницы его не отменяют.
   */
  function place(choice: TaskPlace) {
    const base = confirmedTask.current;
    if (!task || !base) return;
    const spot = placeOf(choice);
    setError(null);
    setTask((current) => (current ? withPlace(current, spot) : current));
    void taskPlacer.place(base, spot).then((outcome) => {
      openTaskPlaces.get(taskId)?.(outcome);
      // Доску обновляем, даже если окно уже закрыли: карточка переехала.
      if (outcome.last) void Promise.resolve(onChanged()).catch(() => {});
    });
  }

  /** «Сохранить»: все правки черновика разом. */
  function save() {
    const next = withPlace({ ...draft, ...latestText.current }, saved);
    if (!task || taskEditsProblem(next) || !pendingFormEdits(saved, next)) {
      return;
    }
    void run(async () => {
      const updated = await commit(task, next);
      if (updated) resetDraft(draftFromTask(updated));
      return updated ?? undefined;
    }).then((ok) => {
      if (ok) closeSaved();
    });
  }

  /* Раздел и статус — два поля (VED-430): колонки доски двумя группами. */
  const { sections, statuses } = splitColumnsByKind(board.columns);

  /** Отменить правки: вернуть в поля то, что лежит на доске. */
  function discard() {
    if (!task) return;
    resetDraft(draftFromTask(task));
    setJustSaved(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={task ? task.title : "Задача"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="group/sheet max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-sheet p-4 sm:rounded-2xl">
        {!task ? (
          <p className="flex items-center gap-2 text-sm text-text-2">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Открываем карточку…
          </p>
        ) : (
          <>
            {/* Шапка окна — две строки (VED-602): сверху панель кнопок
                (номер, скрепка вложений, крестик), под ней заголовок во
                всю ширину окна. Раньше заголовок стоял между номером и
                крестиком узкой колонкой, и длинное название вытягивалось в
                столбик на пол-экрана. */}
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-xs text-text-2">{task.key}</span>
              {/* Индикатор вложений (VED-431): скриншоты лежат внизу окна,
                  под чек-листом, и об их существовании было не узнать, не
                  долистав. Скрепка с числом — в верхней панели рядом с
                  номером (VED-602), и переход к ним. */}
              {task.attachments.length > 0 && (
                <a
                  href="#work-task-attachments"
                  aria-label={`Вложения: ${task.attachments.length}. Перейти к ним`}
                  title="Перейти к вложениям"
                  className="inline-flex min-h-6 items-center gap-0.5 rounded px-1 text-xs text-text-1 hover:text-text-0"
                >
                  <Paperclip aria-hidden className="size-3.5" />
                  {task.attachments.length}
                </a>
              )}
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Закрыть"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-text-1 hover:text-text-0"
                >
                  <X aria-hidden className="size-5" />
                </button>
              </span>
            </div>
            {/* Название целиком, а не первой строкой. В однострочном поле
                длинное название обрывалось на середине слова, и карточка
                открывалась так, будто текста в ней нет. Поле растёт под текст
                и обведено — иначе заголовок не читается как правимый. Шрифт
                на ступень меньше (VED-602): поле не должно занимать пол-окна. */}
            {/* ✖ — стереть заголовок одним нажатием (VED-488), как в поле
                «Заголовок» новой задачи. Кнопка поверх правого верхнего угла
                поля, вне его: поле растёт вниз под длинный текст. */}
            <div className="relative mb-3">
              <DraftTextarea
                key={`title-${textKey}-${titleKey}`}
                ref={titleRef}
                initialValue={latestText.current.title}
                onValueChange={(value) => editText("title", value)}
                readOnly={!canEdit}
                rows={1}
                maxLength={200}
                aria-label="Название задачи"
                onInput={(event) => growToText(event.currentTarget)}
                onKeyDown={(event) => {
                  // Enter в заголовке — это «готово»: сохранить, а не новая
                  // строка.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    save();
                  }
                }}
                className={`block w-full resize-none overflow-hidden rounded-lg py-1 pl-2 font-display text-base font-bold leading-snug text-text-0 ${
                  canEdit
                    ? "border border-glass-brd bg-bg-1 pr-10"
                    : "bg-transparent pr-2"
                }`}
              />
              {canEdit && draft.title && (
                <button
                  type="button"
                  onClick={clearTitle}
                  aria-label="Очистить заголовок"
                  title="Очистить заголовок"
                  className="absolute right-0.5 top-0.5 flex size-8 items-center justify-center rounded-md text-text-2 hover:text-text-0"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>

            {error && (
              <p role="alert" className="mb-3 text-sm text-magenta">
                {error}
              </p>
            )}

            {/* Поля карточки — одной сеткой в два столбца и на телефоне
                (VED-431, «много пустых мест»): раньше каждое поле стояло
                своей строкой во всю ширину, и до описания надо было
                листать. Раздел и статус — два поля, а не один список
                (VED-430): «нужно отделить разделы задач и разделы их
                статусов». */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3 sm:gap-x-3">
              {sections.length > 0 && (
                <label className="min-w-0 text-xs text-text-1">
                  Раздел
                  <select
                    value={task.sectionId ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      // Задача без статуса переезжает в выбранный раздел,
                      // задача в статусе остаётся там — меняется только
                      // раздел. Уходит сразу (VED-526, VED-611).
                      place(
                        chooseSection(
                          placeOf(task),
                          event.target.value,
                          board.columns,
                        ),
                      )
                    }
                    className={FIELD_CLASS}
                  >
                    {!task.sectionId && (
                      <option value="" disabled>
                        Не указан
                      </option>
                    )}
                    {sections.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {statuses.length > 0 && (
                <label className="min-w-0 text-xs text-text-1">
                  Статус
                  <select
                    value={placeStatusId(placeOf(task), board.columns)}
                    disabled={!canEdit}
                    onChange={(event) =>
                      // Статус — та же колонка доски: задача переезжает в
                      // неё, а раздел остаётся прежним. Уходит сразу
                      // (VED-526, VED-611).
                      place(
                        chooseStatus(
                          placeOf(task),
                          event.target.value,
                          board.columns,
                        ),
                      )
                    }
                    className={FIELD_CLASS}
                  >
                    {/* «Новое» (VED-444, было «Без статуса»): задача, которую
                        ещё не брали в работу, — новая, и так она стоит по
                        умолчанию. */}
                    {sections.length > 0 && <option value="">Новое</option>}
                    {statuses.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="min-w-0 text-xs text-text-1">
                Важность
                <select
                  value={draft.priority}
                  disabled={!canEdit}
                  onChange={(event) =>
                    edit({ priority: event.target.value as WorkTaskPriority })
                  }
                  className={FIELD_CLASS}
                >
                  {Object.entries(PRIORITY_TITLE).map(([value, title]) => (
                    <option key={value} value={value}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>

              {/* «Дата» на месте прежней графы «Срок» (VED-598): когда
                  задачу завели. Её не выбирают — только показывают, как
                  «Задачу поставил». */}
              <div className="min-w-0 text-xs text-text-1">
                Дата
                <p className="mt-1 truncate rounded-xl border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0">
                  <time dateTime={task.createdAt}>
                    {formatTaskDate(task.createdAt)}
                  </time>
                </p>
              </div>

              {/* Срок новой задаче больше не ставят (VED-598), но уже
                  поставленный остаётся виден и правится: он красит карточку
                  на доске и раскладывает «Мой день», а убрать его иначе
                  негде. Держимся за сохранённый срок, а не за черновик —
                  иначе поле исчезало бы, пока его стирают. */}
              {(task.dueAt || draft.due !== "") && (
                <label className="min-w-0 text-xs text-text-1">
                  Срок
                  <input
                    type="datetime-local"
                    value={draft.due}
                    disabled={!canEdit}
                    onChange={(event) => edit({ due: event.target.value })}
                    className={FIELD_CLASS}
                  />
                </label>
              )}

              {/* Люди — на всю строку на телефоне и в конце сетки (VED-445):
                  в половине строки «Станислав Санкаршан» в списке обрезался
                  до «Станислав Санкарш», стрелка списка съедала место. */}
              <label className="min-w-0 text-xs text-text-1 max-sm:col-span-2">
                Исполнитель
                <select
                  value={draft.assigneeId ?? ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    edit({ assigneeId: event.target.value || null })
                  }
                  className={FIELD_CLASS}
                >
                  {/* Пустой исполнитель сервер заменяет составившим (VED-320). */}
                  <option value="">Кто составил</option>
                  {board.members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {workPersonLabel(member)}
                    </option>
                  ))}
                </select>
              </label>

              {/* Кто исполняет — в поле; кто поставил — здесь. Постановщика
                  не выбирают: это тот, кто завёл карточку, и подменять его
                  задним числом значит переписывать, с кого спрашивать. */}
              <div className="min-w-0 text-xs text-text-1 max-sm:col-span-2">
                Задачу поставил
                <p className="mt-1 truncate rounded-xl border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0">
                  {task.createdBy?.name ?? "Неизвестно"}
                </p>
              </div>
            </div>

            <DescriptionField
              key={`description-${textKey}`}
              initialValue={latestText.current.description}
              onValueChange={(value) => editText("description", value)}
              readOnly={!canEdit}
              onSave={save}
            />

            {/* Время и стоимость (VED-458) — только на коммерческой доске. */}
            {board.kind === "commercial" && (
              <WorkTaskFinance taskId={task.id} canEdit={Boolean(canEdit)} />
            )}

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
                <li key={item.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={!canEdit}
                    id={`check-${item.id}`}
                    // Имя галочки — текст пункта: у правящего он внутри
                    // кнопки «Изменить пункт», а не в `label` (VED-603).
                    aria-labelledby={`check-text-${item.id}`}
                    onChange={(event) => {
                      const done = event.target.checked;
                      // Галочка — щелчок, а не правка текста: уходит сразу
                      // и полосу «Сохранено / Сохранить» не вызывает
                      // (VED-603), как выбор статуса (VED-611).
                      void run(
                        () => updateWorkChecklistItem(item.id, { done }),
                        { announce: false },
                      );
                    }}
                  />
                  {/* Длинный пункт свёрнут до трёх строк и раскрывается
                      кнопкой «Далее» (VED-375): лимит поднят до 2000 знаков,
                      и продолжение больше не приходится заводить отдельным
                      пунктом. */}
                  {editingItem === item.id ? (
                    <ChecklistEditForm
                      initial={item.text}
                      busy={busy}
                      onSave={(text) =>
                        void run(async () => {
                          const next = await updateWorkChecklistItem(item.id, {
                            text,
                          });
                          finishItemEdit(item.id);
                          return next;
                        })
                      }
                      onCancel={() => finishItemEdit(item.id)}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      {/* Правка — нажатием на сам текст пункта (VED-603),
                          без отдельной кнопки-карандаша. Текст — кнопка:
                          с клавиатуры до правки доходят Tab и Enter, а
                          галочку по-прежнему ставит чекбокс слева. Длинный
                          пункт свёрнут до трёх строк (VED-375);
                          `line-clamp-3` сам задаёт display, поэтому он на
                          внутреннем span, а не на кнопке. */}
                      {canEdit ? (
                        <button
                          type="button"
                          ref={(element) => {
                            if (element) {
                              itemTextButtons.current.set(item.id, element);
                            } else {
                              itemTextButtons.current.delete(item.id);
                            }
                          }}
                          onClick={() => setEditingItem(item.id)}
                          aria-label={`Изменить пункт: ${item.text}`}
                          className="block w-full cursor-text rounded text-left hover:bg-glass"
                        >
                          <span
                            id={`check-text-${item.id}`}
                            className={checklistTextClass(
                              item.done,
                              isLongChecklistText(item.text) &&
                                !expandedItems.has(item.id),
                            )}
                          >
                            {item.text}
                          </span>
                        </button>
                      ) : (
                        <label
                          htmlFor={`check-${item.id}`}
                          id={`check-text-${item.id}`}
                          className={checklistTextClass(
                            item.done,
                            isLongChecklistText(item.text) &&
                              !expandedItems.has(item.id),
                          )}
                        >
                          {item.text}
                        </label>
                      )}
                      {isLongChecklistText(item.text) && (
                        <button
                          type="button"
                          aria-expanded={expandedItems.has(item.id)}
                          aria-controls={`check-text-${item.id}`}
                          onClick={() =>
                            setExpandedItems((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                          className="min-h-6 text-xs font-semibold text-text-1 underline underline-offset-2 hover:text-text-0"
                        >
                          {expandedItems.has(item.id) ? "Свернуть" : "Далее"}
                        </button>
                      )}
                    </div>
                  )}
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
              <ChecklistAddForm
                busy={busy}
                onAdd={(text, clear) =>
                  void run(async () => {
                    const next = await addWorkChecklistItem(task.id, { text });
                    clear();
                    return next;
                  })
                }
              />
            )}

            <h3
              id="work-task-attachments"
              className="mt-5 scroll-mt-4 text-sm font-semibold text-text-0"
            >
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
                            void run(() => removeWorkAttachment(file.id), {
                              announce: false,
                            })
                          }
                          aria-label={`Убрать вложение «${file.name}»`}
                          className={`absolute right-0.5 top-0.5 bg-bg-0/80 ${WORK_ATTACH_REMOVE_CLASS}`}
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
                    <FileText
                      aria-hidden
                      className="size-4 shrink-0 text-text-2"
                    />
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
                          void run(() => removeWorkAttachment(file.id), {
                            announce: false,
                          })
                        }
                        aria-label={`Убрать вложение «${file.name}»`}
                        className={WORK_ATTACH_REMOVE_CLASS}
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
              // там, где выбирать нечего. Вся видимая кнопка — часть label,
              // область не меньше 40×40, нажатие видно сразу, а загрузка
              // пишет «Загружаю…» (VED-266, см. attach-button.ts).
              <label className="mt-2 inline-flex">
                {/* Несколько файлов за раз (VED-112): скриншоты к задаче
                    обычно идут пачкой, а раньше каждый выбирался заново. */}
                <input
                  type="file"
                  multiple
                  className="peer sr-only"
                  disabled={busy || uploading !== null}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    // Поле очищается сразу: иначе тот же файл, выбранный
                    // второй раз, не поднимет change и молча не приложится.
                    event.target.value = "";
                    attachFiles(files);
                  }}
                />
                <span className={WORK_ATTACH_PICKER_CLASS}>
                  {uploading ? (
                    <Loader2
                      aria-hidden
                      className="size-4 motion-safe:animate-spin"
                    />
                  ) : (
                    <Paperclip aria-hidden className="size-4" />
                  )}
                  {uploading
                    ? uploading.total > 1
                      ? `Загружаю ${Math.min(uploading.done + 1, uploading.total)} из ${uploading.total}…`
                      : "Загружаю…"
                    : "Прикрепить картинки или файлы"}
                </span>
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
              <CommentForm
                busy={busy}
                initialBody={
                  readBoardSession(browserSessionStore(), board.id).comments[
                    task.id
                  ] ?? ""
                }
                onBodyChange={(body) =>
                  patchBoardSession(browserSessionStore(), board.id, (s) => ({
                    ...s,
                    comments: body.trim()
                      ? { ...s.comments, [task.id]: body }
                      : without(s.comments, task.id),
                  }))
                }
                onSend={(body, clear) =>
                  void run(async () => {
                    const next = await commentWorkTask(task.id, { body });
                    clear();
                    return next;
                  })
                }
              />
            )}

            {/* Карточка из архива доски (VED-61): вместо «убрать» — «вернуть».
                Иначе открытая из архива карточка предлагала бы убрать её
                второй раз, а обратной дороги не было вовсе. */}
            {(canEdit || canManage) && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {canEdit &&
                  (task.archivedAt ? (
                    <>
                      <p className="text-sm text-text-2">
                        Карточка убрана с доски и лежит в архиве.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => restoreWorkTask(task.id))}
                        className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm font-semibold text-text-0 disabled:opacity-50"
                      >
                        Вернуть на доску
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await archiveWorkTask(task.id);
                          onClose();
                        })
                      }
                      className="text-sm text-magenta disabled:opacity-50"
                    >
                      Убрать карточку в архив
                    </button>
                  ))}

                {/* Удаление без возврата (VED-6) стоит в стороне от архива и
                    спрашивает подтверждение: промах пальцем по соседней
                    кнопке иначе стоил бы всего обсуждения. */}
                {canManage && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const sure = window.confirm(
                        `Стереть «${task.title}» насовсем? Вместе с карточкой исчезнут обсуждение, чек-лист и файлы. Вернуть её будет нельзя — в архиве её тоже не будет.`,
                      );
                      if (!sure) return;
                      void run(async () => {
                        await deleteWorkTaskForever(task.id);
                        onClose();
                      });
                    }}
                    className="ml-auto text-sm text-text-2 hover:text-magenta disabled:opacity-50"
                  >
                    Удалить насовсем
                  </button>
                )}
              </div>
            )}

            {/* Кнопка «Сохранить» (VED-56). Видна после любой правки полей
                карточки — от названия до срока — и прилипает к низу окна:
                поля правят наверху, а кнопка всё равно перед глазами.
                Стоит последней в окне (VED-518: «в самом низу, справа»):
                раньше она шла сразу под описанием и, долистав ниже,
                человек видел её посреди окна, над чек-листом. */}
            {saveBar && (
              <div className="sticky bottom-0 z-10 -mx-4 mt-3 flex flex-wrap items-center gap-2 border-t border-glass-brd bg-sheet px-4 py-3 group-has-[[data-sound-control]]/sheet:pl-16">
                {dirty ? (
                  <>
                    {/* На телефоне надпись — своей строкой, кнопки — под ней
                        справа. В один ряд все трое не помещались, и
                        «Сохранить» переносился в угол слева, отдельно от
                        «Отменить правки» (VED-105). */}
                    <p
                      role={problem ? "alert" : undefined}
                      className={`w-full text-sm sm:mr-auto sm:w-auto ${problem ? "text-magenta" : "text-text-2"}`}
                    >
                      {problem ?? "Есть несохранённые правки"}
                    </p>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={discard}
                        disabled={busy}
                        className="min-h-11 rounded-xl px-3 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
                      >
                        Отменить правки
                      </button>
                      <button
                        type="button"
                        onClick={save}
                        disabled={busy || Boolean(problem)}
                        className="min-h-11 rounded-xl bg-magenta px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? "Сохраняем…" : "Сохранить"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p role="status" className="text-sm text-text-1 sm:mr-auto">
                      Сохранено
                    </p>
                    {/* Всё уже на сервере (пункты чек-листа, комментарий
                        уходят сразу), но кнопка «Сохранить» есть и здесь
                        (VED-400): ею окно и закрывают, как после правки
                        полей. */}
                    <button
                      type="button"
                      onClick={closeSaved}
                      className="ml-auto min-h-11 rounded-xl bg-magenta px-4 py-2 text-sm font-semibold text-white"
                    >
                      Сохранить
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Пуск и пауза звука портала (VED-577): окно накрывает шапку
                затемнением, и её «Плеер / Радио» не нажать. Мятный круг
                (VED-600) плавает в левом нижнем углу окна (VED-608) — там же,
                где пузырь плеера поверх других окон, — и не занимает место
                в шапке. Строка своя, высотой с кнопку (и нулевая, когда
                звука нет): в конце прокрутки кнопка стоит под содержимым, а
                не поверх него. При полосе «Сохранить» строка нулевая и
                идёт после полосы (VED-518): круг садится в её левый край,
                а полоса при нём отступает слева. Пузырь плеера поверх
                окна не показывается — см. `hasForeignModal`.
                VED-612: «опусти немного» — `bottom-0` вместо `bottom-3`.
                Липкий отступ считается от края внутренних полей окна (p-4),
                так что круг теперь в 16px от низа окна, а не в 28px, и
                меньше заслоняет содержимое над собой. */}
            <div
              className={`pointer-events-none sticky bottom-0 z-20 flex h-0 items-end ${saveBar ? "" : "has-[[data-sound-control]]:mt-2 has-[[data-sound-control]]:h-10"}`}
            >
              <CompactSoundButton
                tone="mint"
                className="pointer-events-auto shadow-lg"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Поле текста со своим состоянием (VED-453): нажатие перерисовывает только
 * его. Значение снаружи берётся один раз, при заведении; подставить новое —
 * сменить `key`.
 */
function DraftTextarea({
  initialValue,
  onValueChange,
  ...props
}: Omit<ComponentProps<"textarea">, "value" | "defaultValue" | "onChange"> & {
  initialValue: string;
  onValueChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <textarea
      {...props}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onValueChange(event.target.value);
      }}
    />
  );
}

/**
 * Описание карточки с кнопкой «Читать далее» (VED-578).
 *
 * Поле описания — четыре строки, остальное пряталось под прокрутку внутри
 * поля: на телефоне это узкая полоска, которую не видно и не пролистать,
 * не задев окно карточки. Длинный текст теперь разворачивается кнопкой
 * целиком — поле растёт под текст и продолжает расти при наборе, — и
 * сворачивается обратно. Кнопка видна, только когда текст правда не
 * помещается: меряем поле, а не считаем буквы, ширина у экранов разная.
 */
function DescriptionField({
  initialValue,
  onValueChange,
  readOnly,
  onSave,
}: {
  initialValue: string;
  onValueChange: (value: string) => void;
  readOnly: boolean;
  onSave: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    if (expanded) growToText(element);
    else setOverflows(element.scrollHeight > element.clientHeight + 1);
  }, [expanded]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && !expanded) element.style.height = "";
    measure();
  }, [expanded, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div className="mt-2">
      <label htmlFor={id} className="block text-xs text-text-1">
        Описание
      </label>
      <DraftTextarea
        id={id}
        ref={ref}
        initialValue={initialValue}
        onValueChange={onValueChange}
        onInput={measure}
        readOnly={readOnly}
        rows={4}
        maxLength={10000}
        placeholder="Что именно нужно сделать и что считать готовым"
        onKeyDown={(event) => {
          // Ctrl+Enter (⌘+Enter) — сохранить, не отрывая рук от
          // клавиатуры: простой Enter в описании — новая строка.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onSave();
          }
        }}
        className={`mt-1 block w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 ${
          expanded ? "resize-none overflow-hidden" : ""
        }`}
      />
      {(expanded || overflows) && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 inline-flex min-h-9 items-center rounded-lg px-1 text-sm font-semibold text-magenta hover:underline"
        >
          {expanded ? "Свернуть" : "Читать далее"}
        </button>
      )}
    </div>
  );
}

/**
 * Правка пункта на месте (VED-524, VED-603): поле встаёт вместо текста.
 * Enter или уход из поля — сохранить, Shift+Enter — новая строка, Escape —
 * отменить только правку: окно карточки остаётся открытым. Кнопок «Сохранить /
 * Отменить» нет: правку открывают нажатием на сам текст, и лишняя строка
 * кнопок под ним сбивала. Неизменённый текст ничего не отправляет.
 */
function ChecklistEditForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: string;
  busy: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  /* Правка уже завершена: Enter, а за ним blur от исчезновения поля, иначе
     отправили бы пункт дважды. */
  const finished = useRef(false);
  // Сервер не принял правку — поле остаётся, и её можно завершить заново.
  useEffect(() => {
    if (!busy) finished.current = false;
  }, [busy]);

  function finish(value: string) {
    if (finished.current || busy) return;
    const trimmed = value.trim();
    // Стёртый текст — не правка: пустой пункт сервер не примет, а удаляют
    // корзиной.
    if (!trimmed || trimmed === initial) {
      finished.current = true;
      onCancel();
      return;
    }
    finished.current = true;
    onSave(trimmed);
  }

  return (
    <form
      className="flex min-w-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        finish(text);
      }}
    >
      <textarea
        value={text}
        rows={1}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onInput={(event) => growToText(event.currentTarget)}
        onFocus={(event) => growToText(event.currentTarget)}
        onBlur={(event) => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // Иначе Escape долетел бы до окна и закрыл карточку.
            event.stopPropagation();
            finished.current = true;
            onCancel();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        maxLength={WORK_CHECKLIST_TEXT_MAX}
        aria-label="Текст пункта чек-листа"
        aria-describedby="work-checklist-edit-hint"
        disabled={busy}
        className="w-full resize-none overflow-hidden rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />
      <span id="work-checklist-edit-hint" className="sr-only">
        Enter — сохранить, Escape — отменить
      </span>
    </form>
  );
}

/**
 * Новый пункт чек-листа. Текст живёт здесь, а не в окне: иначе каждая буква
 * перерисовывала всю карточку (VED-453). `clear` — очистить поле, когда пункт
 * дошёл до сервера.
 */
function ChecklistAddForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (text: string, clear: () => void) => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        onAdd(trimmed, () => setText(""));
      }}
    >
      {/* Поле растёт под текст (VED-375): пункт теперь до 2000
          знаков. Enter — добавить, как было; Shift+Enter — новая
          строка внутри пункта. */}
      <textarea
        value={text}
        rows={1}
        onChange={(event) => setText(event.target.value)}
        onInput={(event) => growToText(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        maxLength={WORK_CHECKLIST_TEXT_MAX}
        placeholder="Добавить пункт"
        aria-label="Новый пункт чек-листа"
        className="min-w-0 flex-1 resize-none overflow-hidden rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />
      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="rounded-xl bg-glass px-3 py-2 text-sm text-text-0 disabled:opacity-50"
      >
        Добавить
      </button>
    </form>
  );
}

/** Новый комментарий — со своим текстом, по той же причине, что и чек-лист. */
function CommentForm({
  busy,
  initialBody = "",
  onBodyChange,
  onSend,
}: {
  busy: boolean;
  /** Недописанное до ухода в другое окно портала (VED-520). */
  initialBody?: string;
  onBodyChange?: (body: string) => void;
  onSend: (body: string, clear: () => void) => void;
}) {
  const [body, setBodyState] = useState(initialBody);
  const setBody = (next: string) => {
    setBodyState(next);
    onBodyChange?.(next);
  };
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = body.trim();
        if (!trimmed) return;
        onSend(trimmed, () => setBody(""));
      }}
    >
      <input
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={4000}
        placeholder="Написать"
        aria-label="Новый комментарий"
        className="min-w-0 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />
      <button
        type="submit"
        disabled={busy || !body.trim()}
        className="rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Отправить
      </button>
    </form>
  );
}
