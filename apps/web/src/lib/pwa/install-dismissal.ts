export const installDismissalKey = "pwa:install-dismissed";

export function isInstallBannerDismissed(
  storage: Pick<Storage, "getItem">,
): boolean {
  try {
    return storage.getItem(installDismissalKey) === "1";
  } catch {
    // В приватном режиме доступ к хранилищу может бросать: показываем баннер.
    return false;
  }
}

export function rememberInstallDismissal(
  storage: Pick<Storage, "setItem">,
): void {
  try {
    storage.setItem(installDismissalKey, "1");
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
