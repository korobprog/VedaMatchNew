import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

/**
 * jsdom не реализует EventSource, а живые ленты (друзья, чат) открывают его
 * прямо при монтировании — без заглушки любой тест страницы с такой лентой
 * падает на ReferenceError.
 *
 * Заглушка молчит намеренно: если бы она сообщала об ошибке, подписчик начал
 * бы обновлять сессию и переподключаться по таймеру посреди теста. Тесты
 * проверяют разметку, а не поток.
 */
if (!("EventSource" in globalThis)) {
  class SilentEventSource {
    close(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return false;
    }
  }
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    SilentEventSource;
}

// jsdom не реализует matchMedia; компоненты с адаптивной логикой полагаются на него.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
