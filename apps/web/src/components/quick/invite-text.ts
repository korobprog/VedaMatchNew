/*
 * Чистая логика окна «Пригласить» (VED-618): счётчик длины черновика и
 * текст ошибки сохранения. Правила те же, что у сервера
 * (`rewards-invite-text.ts`): длина считается после приведения переводов
 * строк и обрезки краёв, пустое поле — вернуть текст по умолчанию.
 */

/** Как сервер увидит черновик: `\r\n` → `\n`, края срезаны. */
export function normalizeInviteDraft(draft: string): string {
  return draft.replace(/\r\n?/g, "\n").trim();
}

export interface InviteDraftState {
  length: number;
  /** Длиннее потолка — «Сохранить» недоступна. */
  tooLong: boolean;
  /** Пусто — сохранение вернёт текст по умолчанию. */
  resetsToDefault: boolean;
}

export function inviteDraftState(
  draft: string,
  maxLength: number,
): InviteDraftState {
  const length = normalizeInviteDraft(draft).length;
  return {
    length,
    tooLong: length > maxLength,
    resetsToDefault: length === 0,
  };
}

/**
 * Сообщение об ошибке из ответа API. Nest отдаёт JSON с `message` (строкой
 * или массивом); всё прочее — общий текст, а не сырой ответ сервера.
 */
export function inviteSaveErrorText(body: unknown): string {
  const fallback = "Не удалось сохранить текст. Попробуйте ещё раз.";
  if (typeof body !== "string" || !body) return fallback;
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    const message = Array.isArray(parsed.message)
      ? parsed.message.join(", ")
      : parsed.message;
    return typeof message === "string" && message ? message : fallback;
  } catch {
    return fallback;
  }
}
