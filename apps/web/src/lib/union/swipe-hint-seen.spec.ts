import { describe, expect, it } from "vitest";
import {
  isSwipeHintSeen,
  rememberSwipeHintSeen,
  swipeHintKey,
} from "./swipe-hint-seen";

describe("swipe hint", () => {
  it("показывается, пока в хранилище пусто", () => {
    expect(isSwipeHintSeen({ getItem: () => null })).toBe(false);
  });

  it("не возвращается после первого показа", () => {
    const store = new Map<string, string>();
    rememberSwipeHintSeen({ setItem: (key, value) => void store.set(key, value) });

    expect(store.get(swipeHintKey)).toBe("1");
    expect(isSwipeHintSeen({ getItem: (key) => store.get(key) ?? null })).toBe(
      true,
    );
  });

  it("считает чужое значение за «не видел»", () => {
    // Ключ мог остаться от старого формата или быть затёрт вручную.
    expect(isSwipeHintSeen({ getItem: () => "true" })).toBe(false);
  });

  it("переживает недоступное хранилище", () => {
    // Приватный режим Safari бросает на доступе к localStorage.
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };

    expect(isSwipeHintSeen(broken)).toBe(false);
    expect(() => rememberSwipeHintSeen(broken)).not.toThrow();
  });
});
