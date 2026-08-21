import type { PwaBrowserFamily, PwaDisplayMode, PwaPlatform } from "@vedamatch/shared";

export const browserNames: Record<PwaBrowserFamily, string> = {
  chrome: "Chrome",
  samsung: "Samsung Internet",
  "yandex-browser": "Яндекс.Браузер",
  "yandex-app": "приложение Яндекса",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Edge",
  opera: "Opera",
  other: "этот браузер",
};

export const platformNames: Record<PwaPlatform, string> = {
  android: "Android",
  ios: "iOS",
  desktop: "десктоп",
};

export const displayModeNames: Record<PwaDisplayMode, string> = {
  fullscreen: "во весь экран",
  standalone: "как приложение",
  "minimal-ui": "как приложение с панелью",
  browser: "во вкладке браузера",
};
