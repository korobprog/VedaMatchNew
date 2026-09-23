import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

/**
 * `next/font/google` работает только внутри сборщика Next: в vitest вызов
 * шрифта — не функция, и падает сам импорт компонента. Шрифт стиха шлоки
 * (VED-386) подключается в компоненте карточки ленты, поэтому без заглушки
 * падали бы все тесты ленты Образования. Тестам нужна разметка, не шрифт.
 */
vi.mock("next/font/google", () => {
  const font = () => ({ className: "", variable: "", style: { fontFamily: "" } });
  return {
    Tiro_Devanagari_Sanskrit: font,
    Noto_Serif: font,
    Unbounded: font,
    Manrope: font,
    IBM_Plex_Mono: font,
  };
});

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

// jsdom не реализует scrollIntoView; компоненты, подводящие человека к нужному
// месту списка, зовут его в эффекте — без заглушки они падают на монтировании.
if (
  typeof Element !== "undefined" &&
  !(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom не реализует ResizeObserver, а компоненты, которые меряют себя сами
// (бегущая строка в плеере, обрезанная цитата в ленте), подписываются на него
// прямо в эффекте. Заглушка молчит: в jsdom разметки нет, наблюдать нечего, а
// первый замер компоненты делают сами, не дожидаясь отчёта.
if (!("ResizeObserver" in globalThis)) {
  class SilentResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    SilentResizeObserver;
}

/**
 * jsdom не декодирует картинки: ни `createImageBitmap`, ни `naturalWidth` у
 * `<img>` там не работают. А формы, которые берут картинку у человека, теперь
 * меряют её сторону прямо при выборе (VED-328) — без заглушки любая из них в
 * тесте отвечает «не удалось прочитать картинку».
 *
 * Заглушка отдаёт заведомо годный кадр: размер в этих тестах не проверяют.
 * Тест про сам отказ по размеру подменяет её своим ответом — так проверка
 * границы остаётся видимой в спеке, а не прячется здесь.
 */
if (!("createImageBitmap" in globalThis)) {
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
    async () => ({ width: 1080, height: 1350, close: () => {} });
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
