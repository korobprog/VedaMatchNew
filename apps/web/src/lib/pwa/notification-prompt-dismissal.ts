export const notificationPromptKey = "pwa:notify-prompt-dismissed";

/** Установка приложения — отдельный повод спросить про уведомления: в
 *  standalone они и работают по-настоящему, а на iPhone только там. */
export type NotificationPromptStage = "browser" | "installed";

export function isNotificationPromptDismissed(
  dismissedStage: string | null,
  stage: NotificationPromptStage,
): boolean {
  if (!dismissedStage) return false;
  // Отказ, данный в браузере, установку не переживает.
  return stage === "browser" || dismissedStage === "installed";
}

export function rememberNotificationPromptDismissal(
  storage: Pick<Storage, "setItem">,
  stage: NotificationPromptStage,
): void {
  try {
    storage.setItem(notificationPromptKey, stage);
  } catch {
    // В приватном режиме запись может бросать — не повод ронять страницу.
  }
  for (const listener of listeners) listener();
}

// Хранилище — внешний источник состояния: читаем его через
// useSyncExternalStore, чтобы не расходиться с разметкой сервера.
let listeners: Array<() => void> = [];

export function subscribeNotificationPrompt(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getNotificationPromptSnapshot(): string | null {
  if (typeof window === "undefined") return "installed";
  try {
    return window.localStorage.getItem(notificationPromptKey);
  } catch {
    return null;
  }
}

/** На сервере окно не рисуем: считаем вопрос закрытым на всех этапах. */
export function getNotificationPromptServerSnapshot(): string | null {
  return "installed";
}
