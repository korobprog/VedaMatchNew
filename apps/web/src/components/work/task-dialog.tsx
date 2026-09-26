"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { FileText, Loader2, Paperclip, Pencil, Trash2, X } from "lucide-react";
import { WORK_CHECKLIST_TEXT_MAX } from "@vedamatch/shared";
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
  deleteWorkTaskForever,
  getWorkTask,
  moveWorkTask,
  removeWorkChecklistItem,
  restoreWorkTask,
  updateWorkChecklistItem,
  updateWorkTask,
} from "@/lib/work-api";
import { uploadInTurn, uploadProblemMessage } from "./attach-files";
import { isLongChecklistText } from "./checklist-text";
import {
  chooseSection,
  chooseStatus,
  placeStatusId,
  splitColumnsByKind,
} from "./task-section";
import { workPersonLabel } from "./person-label";
import { PRIORITY_TITLE } from "./task-priority";
import { DUE_PRESETS, duePresetInput, type DuePreset } from "./task-due";
import {
  draftFromTask,
  hasTaskEdits,
  pendingTaskEdits,
  taskEditsProblem,
  type TaskDraft,
} from "./task-edits";
import { WorkTaskFinance } from "./task-finance";
import {
  browserSessionStore,
  patchBoardSession,
  readBoardSession,
  without,
} from "./board-session";

/** Поле карточки: одинаковое у всех списков и у срока. */
const FIELD_CLASS =
  "mt-1 block w-full min-w-0 rounded-xl border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0";

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Черновик всех полей карточки (VED-56): название, описание, раздел,
     исполнитель, важность и срок. Сохраняет кнопка «Сохранить» или закрытие
     окна — ни потеря фокуса, ни выбор в списке на сервер сами не уходят,
     иначе кнопка после такой правки не появлялась. */
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
  /** Пункт чек-листа, который правят на месте (VED-524). */
  const [editingItem, setEditingItem] = useState<string | null>(null);
  /** Какие длинные пункты чек-листа раскрыты кнопкой «Далее» (VED-375). */
  const [expandedItems, setExpandedItems] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Только что сохранили — показать «Сохранено», пока снова не начали править.
   *  Ставят и кнопка «Сохранить», и действия со своей кнопкой (чек-лист,
   *  вложения, комментарий): они уходят сразу, и об этом тоже надо сказать. */
  const [justSaved, setJustSaved] = useState(false);
  /** Идёт загрузка нескольких вложений: сколько ушло из скольких. */
  const [uploading, setUploading] = useState<{
    done: number;
    total: number;
  } | null>(null);
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
        setTask(loaded);
        // Правки, не сохранённые до ухода в другое окно портала (VED-520),
        // возвращаются в поля — с кнопкой «Сохранить», как были.
        const kept = readBoardSession(browserSessionStore(), board.id)
          .taskDrafts[loaded.id];
        resetDraft(kept ?? draftFromTask(loaded));
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
  }, [taskId, board.id]);

  // Высоту заголовка считаем после загрузки: до неё в поле пусто и оно
  // осталось бы в одну строку.
  useEffect(() => {
    if (titleRef.current) growToText(titleRef.current);
  }, [textKey]);

  const saved = task ? draftFromTask(task) : draft;
  const dirty = Boolean(task) && hasTaskEdits(saved, draft);

  // Несохранённое — в память вкладки (VED-520): уход в другое окно портала
  // снимает окно карточки, и без этого правка пропадала. Сохранили или
  // отменили — запись стирается.
  useEffect(() => {
    if (!task) return;
    const next = { ...draft, ...latestText.current };
    const unsaved = hasTaskEdits(draftFromTask(task), next);
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
        setTask(latest);
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
    [],
  );

  /**
   * Закрыть окно, не потеряв правок: несохранённое уходит на сервер. Раньше
   * Escape прямо из поля закрывал окно раньше, чем поле теряло фокус, и
   * правка пропадала.
   */
  const requestClose = useCallback(() => {
    const next = { ...draft, ...latestText.current };
    if (task && canEdit && pendingTaskEdits(draftFromTask(task), next)) {
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
  async function run(action: () => Promise<WorkTaskDto | void>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setTask(next);
      await onChanged();
      // Дошло — окно так и говорит. Правок в черновике это не касается: пока
      // они есть, полоса показывает их, а не «Сохранено».
      setJustSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не сохранилось");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Вложения по одному запросу на файл, по очереди (VED-112). Если какой-то
   * не приложился, остальные остаются в карточке, а ошибка называет его по
   * имени.
   */
  function attachFiles(files: File[]) {
    if (files.length === 0) return;
    void run(async () => {
      try {
        const result = await uploadInTurn(
          files,
          (file) => attachWorkFile(taskId, file),
          (done, total) => setUploading({ done, total }),
        );
        const message = uploadProblemMessage(result);
        if (!message) return result.last;
        // Приложившиеся уже на сервере: показываем их, и только потом ошибку.
        if (result.last) setTask(result.last);
        await onChanged();
        throw new Error(message);
      } finally {
        setUploading(null);
      }
    });
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

  /**
   * Раздел и статус уходят сразу, без «Сохранить» (VED-526): перенос —
   * действие, как галочка в чек-листе, а не правка текста, и кнопка после
   * него только сбивала. Отправляется одно место — от сохранённой карточки,
   * а не от черновика: несохранённые правки полей остаются в черновике и
   * ждут своей кнопки.
   */
  function place(choice: Pick<TaskDraft, "columnId" | "sectionId">) {
    if (!task) return;
    // Выбор строится от черновика и несёт его поля целиком — берём из него
    // только место.
    const spot = { columnId: choice.columnId, sectionId: choice.sectionId };
    setDraft((current) => ({ ...current, ...spot }));
    void run(async () => {
      const updated = await commit(task, { ...draftFromTask(task), ...spot });
      return updated ?? undefined;
    });
  }

  /** «Сохранить»: все правки черновика разом. */
  function save() {
    const next = { ...draft, ...latestText.current };
    if (!task || taskEditsProblem(next) || !pendingTaskEdits(saved, next)) {
      return;
    }
    void run(async () => {
      const updated = await commit(task, next);
      if (updated) resetDraft(draftFromTask(updated));
      return updated ?? undefined;
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
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-sheet p-4 sm:rounded-2xl">
        {!task ? (
          <p className="flex items-center gap-2 text-sm text-text-2">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Открываем карточку…
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-start gap-2">
              <span className="mt-1 flex shrink-0 flex-col items-start gap-1">
                <span className="font-mono text-xs text-text-2">{task.key}</span>
                {/* Индикатор вложений (VED-431): скриншоты лежат внизу окна,
                    под чек-листом, и об их существовании было не узнать, не
                    долистав. Скрепка с числом у номера — и переход к ним. */}
                {task.attachments.length > 0 && (
                  <a
                    href="#work-task-attachments"
                    aria-label={`Вложения: ${task.attachments.length}. Перейти к ним`}
                    title="Перейти к вложениям"
                    className="-mx-1 inline-flex min-h-6 items-center gap-0.5 rounded px-1 text-xs text-text-1 hover:text-text-0"
                  >
                    <Paperclip aria-hidden className="size-3.5" />
                    {task.attachments.length}
                  </a>
                )}
              </span>
              {/* Название целиком, а не первой строкой. В однострочном поле
                  длинное название обрывалось на середине слова, и карточка
                  открывалась так, будто текста в ней нет. Поле растёт под текст
                  и обведено — иначе заголовок не читается как правимый. */}
              <DraftTextarea
                key={`title-${textKey}`}
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
                className={`min-w-0 flex-1 resize-none overflow-hidden rounded-lg px-2 py-1 font-display text-lg font-bold text-text-0 ${
                  canEdit ? "border border-glass-brd bg-bg-1" : "bg-transparent"
                }`}
              />
              <button
                type="button"
                onClick={requestClose}
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
                    value={draft.sectionId ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      // Задача без статуса переезжает в выбранный раздел,
                      // задача в статусе остаётся там — меняется только
                      // раздел. Уходит сразу (VED-526).
                      place(chooseSection(draft, event.target.value, board.columns))
                    }
                    className={FIELD_CLASS}
                  >
                    {draft.sectionId === null && (
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
                    value={placeStatusId(draft, board.columns)}
                    disabled={!canEdit}
                    onChange={(event) =>
                      // Статус — та же колонка доски: задача переезжает в
                      // неё, а раздел остаётся прежним. Уходит сразу (VED-526).
                      place(chooseStatus(draft, event.target.value, board.columns))
                    }
                    className={FIELD_CLASS}
                  >
                    {sections.length > 0 && (
                      <option value="">Без статуса</option>
                    )}
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

              {/* Срок живёт здесь, в карточке (VED-378): из формы новой
                  задачи он убран. */}
              <label className="min-w-0 text-xs text-text-1">
                Срок
                {/* Пустой срок — выбор из трёх вариантов (VED-529), а не
                    голое поле даты: срок чаще всего «сегодня» или «завтра».
                    Выбрали — появляется поле с датой, где её можно уточнить. */}
                {draft.due === "" && canEdit ? (
                  <select
                    value=""
                    onChange={(event) => {
                      const preset = event.target.value as DuePreset;
                      if (preset) edit({ due: duePresetInput(preset, new Date()) });
                    }}
                    className={FIELD_CLASS}
                  >
                    <option value="">Без срока</option>
                    {DUE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="datetime-local"
                    value={draft.due}
                    disabled={!canEdit}
                    onChange={(event) => edit({ due: event.target.value })}
                    className={FIELD_CLASS}
                  />
                )}
              </label>

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

            <label className="mt-2 block text-xs text-text-1">
              Описание
              <DraftTextarea
                key={`description-${textKey}`}
                initialValue={latestText.current.description}
                onValueChange={(value) => editText("description", value)}
                readOnly={!canEdit}
                rows={4}
                maxLength={10000}
                placeholder="Что именно нужно сделать и что считать готовым"
                onKeyDown={(event) => {
                  // Ctrl+Enter (⌘+Enter) — сохранить, не отрывая рук от
                  // клавиатуры: простой Enter в описании — новая строка.
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    event.preventDefault();
                    save();
                  }
                }}
                className="mt-1 block w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              />
            </label>

            {/* Кнопка «Сохранить» (VED-56). Видна после любой правки полей
                карточки — от названия до срока — и прилипает к низу окна:
                поля правят наверху, а кнопка всё равно перед глазами. */}
            {canEdit && (dirty || justSaved) && (
              <div className="sticky bottom-0 z-10 -mx-4 mt-3 flex flex-wrap items-center gap-2 border-t border-glass-brd bg-sheet px-4 py-3">
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
                  <p role="status" className="text-sm text-text-1">
                    Сохранено
                  </p>
                )}
              </div>
            )}

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
                    onChange={(event) => {
                      const done = event.target.checked;
                      void run(() =>
                        updateWorkChecklistItem(item.id, { done }),
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
                          setEditingItem(null);
                          return next;
                        })
                      }
                      onCancel={() => setEditingItem(null)}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`check-${item.id}`}
                        id={`check-text-${item.id}`}
                        // `line-clamp-3` сам задаёт display: вместе с `block`
                        // побеждал `block`, и свёрнутый пункт не сворачивался.
                        className={`whitespace-pre-wrap text-sm [overflow-wrap:anywhere] ${
                          item.done ? "text-text-2 line-through" : "text-text-0"
                        } ${
                          isLongChecklistText(item.text) &&
                          !expandedItems.has(item.id)
                            ? "line-clamp-3"
                            : "block"
                        }`}
                      >
                        {item.text}
                      </label>
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
                  {/* «Изменить» — рядом с «Убрать» (VED-524): опечатку в
                      пункте правят на месте, а не удаляют и заводят заново. */}
                  {canEdit && editingItem !== item.id && (
                    <button
                      type="button"
                      aria-label={`Изменить пункт «${item.text}»`}
                      disabled={busy}
                      onClick={() => setEditingItem(item.id)}
                      className="text-text-2 hover:text-text-0 disabled:opacity-50"
                    >
                      <Pencil aria-hidden className="size-4" />
                    </button>
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
                {uploading && uploading.total > 1
                  ? `Прикрепляем ${Math.min(uploading.done + 1, uploading.total)} из ${uploading.total}…`
                  : "Прикрепить картинки или файлы"}
                {/* Несколько файлов за раз (VED-112): скриншоты к задаче
                    обычно идут пачкой, а раньше каждый выбирался заново. */}
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  disabled={busy}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    // Поле очищается сразу: иначе тот же файл, выбранный
                    // второй раз, не поднимет change и молча не приложится.
                    event.target.value = "";
                    attachFiles(files);
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
 * Новый пункт чек-листа. Текст живёт здесь, а не в окне: иначе каждая буква
 * перерисовывала всю карточку (VED-453). `clear` — очистить поле, когда пункт
 * дошёл до сервера.
 */
/**
 * Правка пункта чек-листа на месте (VED-524). Enter — сохранить, Shift+Enter
 * — новая строка, Escape — отменить: только правку, окно карточки остаётся
 * открытым.
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
  const trimmed = text.trim();
  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed) return;
        if (trimmed === initial) onCancel();
        else onSave(trimmed);
      }}
    >
      <textarea
        value={text}
        rows={1}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onInput={(event) => growToText(event.currentTarget)}
        onFocus={(event) => growToText(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // Иначе Escape долетел бы до окна и закрыл карточку.
            event.stopPropagation();
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
        className="w-full resize-none overflow-hidden rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-9 rounded-xl px-3 text-sm text-text-1 hover:text-text-0"
        >
          Отменить
        </button>
        <button
          type="submit"
          disabled={busy || !trimmed}
          className="min-h-9 rounded-xl bg-glass px-3 text-sm text-text-0 disabled:opacity-50"
        >
          Сохранить
        </button>
      </div>
    </form>
  );
}

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
