import { detectPlatform } from "./pwa/browser";

/**
 * Устройство гостя ради подсветки нужной карточки на секции загрузки
 * приложения (VED-176). Тонкая обёртка над `detectPlatform` из PWA-модуля:
 * там уже есть проверенный разбор `User-Agent`, а секции загрузки не нужны
 * браузер и режим отображения — только «какую карточку показать первой».
 */
export type DownloadDevice = "android" | "ios" | "desktop";

export function resolveDownloadDevice(userAgent: string): DownloadDevice {
  return detectPlatform(userAgent);
}
