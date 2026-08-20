import type { InstallEnvironmentReport } from "@vedamatch/shared";
import {
  detectBrowserFamily,
  detectDisplayMode,
  detectPlatform,
  installsAsStandaloneApp,
} from "./browser";

export interface InstallEnvironmentInput {
  userAgent: string;
  matchMedia: (query: string) => { matches: boolean };
  navigatorStandalone?: boolean;
}

/**
 * Замер «с чего человек нас открыл». Отвечает на вопрос, ради которого всё
 * затевалось: какая доля аудитории сидит в браузере, где установка даёт
 * ярлык с поисковой строкой, и сколько уже сидит в таком ярлыке.
 */
export function buildInstallEnvironmentReport(
  input: InstallEnvironmentInput,
): InstallEnvironmentReport {
  const browser = detectBrowserFamily(input.userAgent);
  const platform = detectPlatform(input.userAgent);
  return {
    browser,
    platform,
    displayMode: detectDisplayMode(input.matchMedia, input.navigatorStandalone),
    standaloneCapable: installsAsStandaloneApp(browser, platform),
  };
}
