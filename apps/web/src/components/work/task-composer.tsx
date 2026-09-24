"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkMemberDto, WorkTaskPriority } from "@vedamatch/shared";
import { MAX_FILES_AT_ONCE } from "./attach-files";
import { deriveTaskTitle } from "./task-title";
import { PRIORITY_TITLE } from "./task-priority";

/**
 * Черновик новой задачи. Доска держит его копию в ref, а не в состоянии: форма
 * исчезает, когда раздел сворачивают, и начатое описание обязано дожить до
 * разворота, — но буква в поле не должна перерисовывать доску (VED-453).
 */
export interface TaskComposerDraft {
  /* Черновик — это ОПИСАНИЕ, а не название (VED-324): человек пишет задачу
     как думает, заголовок собирается сам. Свой заголовок живёт отдельно, и
     `null` в нём значит «собери сам»: пустая строка значила бы «человек стёр
     заголовок» и затирала бы выведенный. */
  description: string;
  title: string | null;
  /* Скриншоты, выбранные до создания карточки. Сервер принимает вложения
     только к существующей задаче, поэтому файлы ждут здесь и уходят сразу
     после неё. */
  files: File[];
  assigneeId: string;
  priority: WorkTaskPriority;
}

/** Пустой черновик. Исполнитель заполнен заранее — себе самый частый случай. */
export function emptyComposerDraft(assigneeId: string): TaskComposerDraft {
  return {
    description: "",
    title: null,
    files: [],
    assigneeId,
    // Важность начинает с нуля: «срочно» у прошлой задачи ничего не говорит
    // о следующей, а тихо унаследованное «срочно» обесценивает метку на всей
    // доске.
    priority: "normal",
  };
}

/** Есть ли что терять: начатое описание или выбранные скриншоты. */
export function composerHasContent(draft: TaskComposerDraft): boolean {
  return draft.description.trim() !== "" || draft.files.length > 0;
}

/**
 * Форма новой задачи в разделе доски. Свой текст держит сама: раньше
 * черновик жил в состоянии доски, и каждое нажатие перерисовывало все
 * карточки — на телефоне клавиатура не поспевала и склеивала слова (VED-453).
 *
 * `initialDraft` читается один раз, при открытии формы; правки уходят
 * наружу через `onDraftChange`. `onSubmit` возвращает, дошла ли задача: при
 * успехе доска закрывает форму.
 */
export function TaskComposer({
  columnName,
  members,
  viewerId,
  initialDraft,
  onDraftChange,
  onSubmit,
  onCancel,
}: {
  columnName: string;
  members: readonly WorkMemberDto[];
  viewerId: string;
  initialDraft: TaskComposerDraft;
  onDraftChange: (draft: TaskComposerDraft) => void;
  onSubmit: (draft: TaskComposerDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [initial] = useState(initialDraft);
  const [draft, setDraft] = useState(initial.description);
  const [draftTitle, setDraftTitle] = useState<string | null>(initial.title);
  const [draftFiles, setDraftFiles] = useState<File[]>(initial.files);
  const [draftAssignee, setDraftAssignee] = useState(initial.assigneeId);
  const [draftPriority, setDraftPriority] = useState<WorkTaskPriority>(
    initial.priority,
  );
  const [saving, setSaving] = useState(false);
  /* Обе кнопки переключения заголовка исчезают от собственного нажатия: поле
     правки и строка с выведенным заголовком показываются по очереди. Фокус
     при этом падал на `body` — с клавиатуры человек терял место, а скринридер
     не узнавал, что появилось поле. Поэтому фокус переносим руками: в поле,
     когда открыли правку, и обратно на «Изменить», когда вернулись к
     выведенному заголовку (WCAG 2.2, SC 2.4.3). */
  const editTitleRef = useRef<HTMLButtonElement>(null);
  const returnFocusToEditTitle = useRef(false);

  useEffect(() => {
    onDraftChange({
      description: draft,
      title: draftTitle,
      files: draftFiles,
      assigneeId: draftAssignee,
      priority: draftPriority,
    });
  }, [
    onDraftChange,
    draft,
    draftTitle,
    draftFiles,
    draftAssignee,
    draftPriority,
  ]);

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

  async function submit() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        description: draft,
        title: draftTitle,
        files: draftFiles,
        assigneeId: draftAssignee,
        priority: draftPriority,
      });
    } finally {
      setSaving(false);
    }
  }

  /** Заголовок, который получится из написанного, — считаем на каждом нажатии
      клавиши: строка под полем должна показывать правду, а не обещание. */
  const autoTitle = deriveTaskTitle(draft);

  return (
    <form
      className="mb-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
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
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape") onCancel();
        }}
        rows={4}
        maxLength={2000}
        placeholder="Опишите задачу: что не так, где и что должно быть"
        aria-label={`Описание новой задачи в разделе «${columnName}»`}
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
              onChange={(event) => setDraftTitle(event.target.value)}
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
            onChange={(event) => setDraftAssignee(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0"
          >
            <option value="">Никто</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.userId === viewerId
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
              setDraftPriority(event.target.value as WorkTaskPriority)
            }
            className="mt-1 block w-full rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0"
          >
            {Object.entries(PRIORITY_TITLE).map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
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
              Array.from(event.target.files ?? []).slice(0, MAX_FILES_AT_ONCE),
            )
          }
          className="mt-1 block w-full text-xs text-text-2 file:mr-2 file:rounded-lg file:border file:border-glass-brd file:bg-bg-1 file:px-2 file:py-1 file:text-xs file:text-text-1"
        />
      </label>
      {draftFiles.length > 0 && (
        <p className="mt-1 text-xs text-text-2">
          Приложится {draftFiles.map((file) => file.name).join(", ")}
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
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-text-1"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
