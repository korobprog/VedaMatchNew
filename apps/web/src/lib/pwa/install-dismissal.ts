export const installDismissalKey = "pwa:install-dismissed";

/**
 * Сколько живёт отказ. Крестик — это «не сейчас», а не «никогда»: человек
 * закрывает баннер на бегу, а через месяц уже успевает решить, нужен ли ему
 * портал приложением. Раньше отметка была вечной, и закрывший однажды не
 * видел предложения больше никогда — вернуть его можно было только очисткой
 * хранилища сайта.
 */
export const installDismissalDays = 30;

const dismissalTtlMs = installDismissalDays * 24 * 60 * 60 * 1000;

export function isInstallBannerDismissed(
  storage: Pick<Storage, "getItem">,
  now: number = Date.now(),
): boolean {
  try {
    const stored = storage.getItem(installDismissalKey);
    if (stored === null) return false;
    // Отметка старого формата — просто "1", без даты. Считаем её истёкшей:
    // согласия на «никогда» человек не давал, а следующее закрытие ляжет уже
    // с датой и отработает как положено.
    const dismissedAt = Number(stored);
    if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return false;
    return now - dismissedAt < dismissalTtlMs;
  } catch {
    // В приватном режиме доступ к хранилищу может бросать: показываем баннер.
    return false;
  }
}

export function rememberInstallDismissal(
  storage: Pick<Storage, "setItem">,
  now: number = Date.now(),
): void {
  try {
    storage.setItem(installDismissalKey, String(now));
  } catch {
    // Не смогли запомнить отказ — не повод ронять страницу.
  }
  for (const listener of listeners) listener();
}

// Хранилище — внешний источник состояния, поэтому баннер читает его через
// useSyncExternalStore, а не setState в эффекте: так нет ни лишнего рендера,
// ни расхождения с разметкой сервера.
let listeners: Array<() => void> = [];

export function subscribeInstallDismissal(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getInstallDismissalSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return isInstallBannerDismissed(window.localStorage);
}

/** На сервере считаем баннер закрытым: показывать его до гидратации нечем. */
export function getInstallDismissalServerSnapshot(): boolean {
  return true;
}
