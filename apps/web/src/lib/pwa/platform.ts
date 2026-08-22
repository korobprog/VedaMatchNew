import type { PwaBrowserFamily, PwaPlatform } from "@vedamatch/shared";
import {
  detectBrowserFamily,
  detectDisplayMode,
  detectPlatform,
  installsAsStandaloneApp,
} from "./browser";

export type InstallMode =
  | "installed"
  | "can-prompt"
  /**
   * Браузер установку предлагает, но получится ярлык внутри него самого,
   * а не приложение. Зовём переоткрыть портал там, где установка настоящая.
   */
  | "wrong-browser"
  | "ios-manual"
  /**
   * Установка настоящая, но системного диалога нет: браузер не прислал
   * beforeinstallprompt. Рассказываем, как поставить портал через меню.
   */
  | "android-manual"
  | "unsupported";

// Событие нестандартное: его шлёт только Chromium, в lib.dom оно отсутствует.
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallEnvironment {
  matchMedia: (query: string) => { matches: boolean };
  navigator: { standalone?: boolean; userAgent: string };
  promptEvent: BeforeInstallPromptEvent | null;
}

export interface InstallState {
  mode: InstallMode;
  browser: PwaBrowserFamily;
  platform: PwaPlatform;
}

export function detectInstallState(
  environment: InstallEnvironment,
): InstallState {
  const userAgent = environment.navigator.userAgent;
  const browser = detectBrowserFamily(userAgent);
  const platform = detectPlatform(userAgent);
  const mode = detectInstallMode(environment);
  return { mode, browser, platform };
}

export function detectInstallMode(
  environment: InstallEnvironment,
): InstallMode {
  const userAgent = environment.navigator.userAgent;
  // Не только standalone: ярлык из чужого браузера открывается в minimal-ui,
  // и звать «установите» человека, который уже нажал установку, незачем —
  // задним числом мы этот ярлык всё равно не починим.
  const displayMode = detectDisplayMode(
    environment.matchMedia,
    environment.navigator.standalone,
  );
  if (displayMode !== "browser") return "installed";

  const browser = detectBrowserFamily(userAgent);
  const platform = detectPlatform(userAgent);
  const standaloneCapable = installsAsStandaloneApp(browser, platform);

  // На iOS beforeinstallprompt не существует ни в одном браузере — там
  // установка только вручную через меню «Поделиться», и только из Safari.
  if (platform === "ios") return standaloneCapable ? "ios-manual" : "wrong-browser";

  if (environment.promptEvent)
    return standaloneCapable ? "can-prompt" : "wrong-browser";

  // Без beforeinstallprompt уводить в другой браузер стоит только там, где мы
  // уверены: Яндекс.Браузер шлёт событие не всегда, а обозреватель внутри
  // «Яндекса с Алисой» — никогда, установки в нём нет вовсе.
  if (browser === "yandex-browser" || browser === "yandex-app")
    return "wrong-browser";

  // Дальше — Android без события. Раньше отсюда возвращалось «unsupported», и
  // портал молчал, хотя ставится прекрасно: событие Chrome шлёт один раз и
  // только когда сам сочтёт нужным — на первом визите воркер ещё не управляет
  // страницей, а установившему он не шлёт его вовсе. Отличить «нельзя» от «в
  // этот раз не прислал» по событию нельзя, поэтому не молчим: установка через
  // меню браузера доступна всегда. Тех, у кого портал уже стоит, отсекает
  // getInstalledRelatedApps в use-install-prompt.
  if (platform === "android")
    return standaloneCapable ? "android-manual" : "wrong-browser";

  return "unsupported";
}
