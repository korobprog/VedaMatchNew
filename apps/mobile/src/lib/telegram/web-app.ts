import type { TelegramLaunch } from './launch';

/**
 * Нативная сборка: мини-приложения Telegram здесь не бывает. Интерфейс тот
 * же, что у `web-app.web.ts`, чтобы общий код проверялся одними типами.
 */

export interface TelegramWebApp {
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  disableVerticalSwipes?(): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
  };
}

export const telegramLaunch: TelegramLaunch | null = null;

export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  return Promise.resolve(null);
}
