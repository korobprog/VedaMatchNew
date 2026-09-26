import type { WorkTaskPriority } from "@vedamatch/shared";
import type { TaskDraft } from "./task-edits";

/**
 * Что было на доске, когда человек ушёл в другое окно портала (VED-520).
 *
 * Окна портала (VED-118) переключаются переходом по адресу, и страница
 * планировщика при этом снимается целиком: набранная, но не сохранённая
 * задача пропадала, а вернувшийся видел пустую доску. Теперь недосказанное
 * лежит в `sessionStorage` вкладки — там же, где сами окна, — и доска,
 * открываясь снова, возвращает всё как было:
 *
 * - форму новой задачи с набранным текстом (файлы не переживают: браузер
 *   не даёт сохранить выбранный файл, их придётся выбрать заново);
 * - открытую карточку — только пока она открыта: закрытая не вернётся сама
 *   (ровно на этом ловился «старый косяк» VED-500);
 * - несохранённые правки карточки и недописанный комментарий.
 *
 * Сохранили, отправили или отменили — запись стирается.
 */
export interface BoardComposerSnapshot {
  columnId: string;
  description: string;
  title: string | null;
  assigneeId: string;
  priority: WorkTaskPriority;
}

export interface BoardSession {
  composer: BoardComposerSnapshot | null;
  openTaskId: string | null;
  /** Несохранённые правки карточек, по id задачи. */
  taskDrafts: Record<string, TaskDraft>;
  /** Недописанные комментарии, по id задачи. */
  comments: Record<string, string>;
}

export type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const EMPTY: BoardSession = {
  composer: null,
  openTaskId: null,
  taskDrafts: {},
  comments: {},
};

export function boardSessionKey(boardId: string): string {
  return `vedamatch:work-board:${boardId}`;
}

/** `sessionStorage`, если он есть и доступен: приватный режим его запрещает. */
export function browserSessionStore(): SessionStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readBoardSession(
  store: SessionStore | null,
  boardId: string,
): BoardSession {
  if (!store) return { ...EMPTY };
  try {
    const raw = store.getItem(boardSessionKey(boardId));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<BoardSession>;
    return {
      composer: parsed.composer ?? null,
      openTaskId:
        typeof parsed.openTaskId === "string" ? parsed.openTaskId : null,
      taskDrafts:
        parsed.taskDrafts && typeof parsed.taskDrafts === "object"
          ? parsed.taskDrafts
          : {},
      comments:
        parsed.comments && typeof parsed.comments === "object"
          ? parsed.comments
          : {},
    };
  } catch {
    // Испорченная запись — начинаем с чистого листа, а не падаем.
    return { ...EMPTY };
  }
}

/** Поправить запись доски; пустую — стереть совсем. */
export function patchBoardSession(
  store: SessionStore | null,
  boardId: string,
  change: (current: BoardSession) => BoardSession,
): void {
  if (!store) return;
  try {
    const next = change(readBoardSession(store, boardId));
    const empty =
      !next.composer &&
      !next.openTaskId &&
      Object.keys(next.taskDrafts).length === 0 &&
      Object.keys(next.comments).length === 0;
    if (empty) store.removeItem(boardSessionKey(boardId));
    else store.setItem(boardSessionKey(boardId), JSON.stringify(next));
  } catch {
    // Хранилище переполнено или запрещено — теряем удобство, не работу.
  }
}

/** Запись без ключа `id`: снять черновик карточки или комментарий. */
export function without<T>(
  map: Record<string, T>,
  id: string,
): Record<string, T> {
  if (!(id in map)) return map;
  const next = { ...map };
  delete next[id];
  return next;
}
