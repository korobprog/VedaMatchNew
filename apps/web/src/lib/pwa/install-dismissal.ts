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
}
