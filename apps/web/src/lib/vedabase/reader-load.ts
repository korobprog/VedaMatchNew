// Почему читалка не открыла главу (VED-662). До этого любой сбой загрузки
// превращался в «главы нет на устройстве»: заблокированная книга, ошибка
// сервера и обрыв сети выглядели одинаково, и человеку советовали скачать
// книгу, которую скачать нельзя.
import { ApiError } from "@/lib/http-client";

/**
 * - `offline` — до портала не достучались, а на устройстве главы нет;
 * - `unavailable` — портал ответил, что такой книги или главы нет (в том
 *   числе книга снята с полки);
 * - `failed` — портал ответил ошибкой либо прислал то, что не разобрать.
 */
export type ReaderLoadFailure = "offline" | "unavailable" | "failed";

export function readerLoadFailure(error: unknown): ReaderLoadFailure {
  if (error instanceof ApiError) {
    // Статус 0 — `NetworkError`: ответа не было вовсе.
    if (error.status === 0) return "offline";
    if (error.status === 404) return "unavailable";
    return "failed";
  }
  // Голый `fetch` мимо `apiFetch` отклоняется `TypeError`.
  if (error instanceof TypeError) return "offline";
  return "failed";
}

export const READER_LOAD_TEXT: Record<ReaderLoadFailure, string> = {
  offline:
    "Этой главы нет на устройстве. Скачайте книгу целиком, пока есть сеть, и попробуйте снова.",
  unavailable: "Эта книга или глава сейчас недоступна.",
  failed: "Не удалось загрузить главу. Попробуйте ещё раз.",
};

/** Повторять есть смысл, пока причина не в том, что книги нет. */
export function readerLoadRetriable(failure: ReaderLoadFailure): boolean {
  return failure !== "unavailable";
}

/** Сбой загрузки книги или главы с уже разобранной причиной. */
export class ReaderLoadError extends Error {
  readonly failure: ReaderLoadFailure;

  constructor(cause: unknown) {
    const failure = readerLoadFailure(cause);
    super(READER_LOAD_TEXT[failure]);
    this.name = "ReaderLoadError";
    this.failure = failure;
    this.cause = cause;
  }
}
