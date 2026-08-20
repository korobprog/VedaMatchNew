import type {
  PwaBrowserFamily,
  PwaDisplayMode,
  PwaPlatform,
} from "@vedamatch/shared";

/**
 * Порядок проверок важен: почти все мобильные браузеры подмешивают в
 * User-Agent чужие маркеры. Яндекс.Браузер представляется как Chrome,
 * Samsung Internet — тоже, Edge и Opera — как Chrome и Safari сразу.
 * Поэтому сначала отсеиваем частные случаи, а Chrome и Safari — последними.
 */
export function detectBrowserFamily(userAgent: string): PwaBrowserFamily {
  // «Яндекс — с Алисой» и Яндекс.Старт: обозреватель внутри приложения.
  if (/YaApp_|YaSearchBrowser|YaSearchApp/.test(userAgent)) return "yandex-app";
  if (/YaBrowser/.test(userAgent)) return "yandex-browser";
  if (/SamsungBrowser/.test(userAgent)) return "samsung";
  if (/Edg[A-Za-z]*\//.test(userAgent)) return "edge";
  if (/OPR\/|OPT\/|OPiOS\/|\bOpera\b/.test(userAgent)) return "opera";
  if (/Firefox\/|FxiOS/.test(userAgent)) return "firefox";
  if (/Chrome\/|CriOS/.test(userAgent)) return "chrome";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

export function detectPlatform(userAgent: string): PwaPlatform {
  if (/Android/.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/.test(userAgent)) return "ios";
  return "desktop";
}

/**
 * Даст ли «Установить» в этом браузере настоящее приложение.
 *
 * На Android полноэкранное приложение — это WebAPK, а чеканит его только
 * Chrome с Google Mobile Services и Samsung Internet. Все остальные, включая
 * Яндекс.Браузер, кладут на экран ярлык, который открывает сайт внутри
 * браузера — вместе с его адресной строкой и нижней панелью.
 *
 * На iOS «На экран „Домой“» надёжно работает только из Safari.
 *
 * На десктопе вендор не важен: любой Chromium открывает установленный сайт
 * отдельным окном без адресной строки.
 */
export function installsAsStandaloneApp(
  browser: PwaBrowserFamily,
  platform: PwaPlatform,
): boolean {
  if (platform === "android") return browser === "chrome" || browser === "samsung";
  if (platform === "ios") return browser === "safari";
  return browser !== "other";
}

const displayModes: PwaDisplayMode[] = [
  "fullscreen",
  "standalone",
  "minimal-ui",
];

export function detectDisplayMode(
  matchMedia: (query: string) => { matches: boolean },
  navigatorStandalone?: boolean,
): PwaDisplayMode {
  // iOS до сих пор не отвечает на `(display-mode: standalone)` во всех
  // случаях, зато выставляет проприетарный navigator.standalone.
  if (navigatorStandalone === true) return "standalone";
  for (const mode of displayModes) {
    if (matchMedia(`(display-mode: ${mode})`).matches) return mode;
  }
  return "browser";
}
