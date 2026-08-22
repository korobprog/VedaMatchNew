export interface RelatedApplication {
  platform?: string;
  id?: string;
  url?: string;
}

export interface RelatedAppsNavigator {
  getInstalledRelatedApps?: () => Promise<RelatedApplication[]>;
}

/**
 * Стоит ли портал на этом устройстве отдельным приложением.
 *
 * Спрашиваем у браузера напрямую, потому что косвенных признаков не осталось:
 * во вкладке `display-mode` у установившего такой же `browser`, как у всех, а
 * beforeinstallprompt Chrome ему не шлёт — ровно как и тому, у кого событие
 * потерялось. Без этой проверки режим `android-manual` звал бы ставить портал
 * заново того, у кого он уже стоит.
 *
 * Записи о нативных приложениях (`platform` `play`, `itunes`, `windows`) не в
 * счёт: они про магазин, а не про наш WebAPK.
 */
export async function hasInstalledWebApp(
  navigator: RelatedAppsNavigator,
): Promise<boolean> {
  if (typeof navigator.getInstalledRelatedApps !== "function") return false;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some((app) => app.platform === "webapp");
  } catch {
    // Метод есть только в Chromium и только в защищённом контексте, а вне его
    // бросает. Не знаем — значит не установлено: предложить лишний раз мягче,
    // чем спрятать установку от того, кому она нужна.
    return false;
  }
}
