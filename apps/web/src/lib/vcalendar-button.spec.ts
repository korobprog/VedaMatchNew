import { describe, expect, it, vi } from "vitest";
import {
  isVcalendarButtonShown,
  setVcalendarButtonShown,
  subscribeVcalendarButton,
  vcalendarButtonKey,
} from "./vcalendar-button";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

describe("кнопка «Вайшнавский календарь» (VED-489)", () => {
  it("по умолчанию есть", () => {
    expect(isVcalendarButtonShown(memory())).toBe(true);
  });

  it("прячется и возвращается, подписчики узнают сразу", () => {
    const storage = memory();
    const listener = vi.fn();
    const unsubscribe = subscribeVcalendarButton(listener);

    setVcalendarButtonShown(storage, false);
    expect(storage.data.get(vcalendarButtonKey)).toBe("1");
    expect(isVcalendarButtonShown(storage)).toBe(false);

    setVcalendarButtonShown(storage, true);
    expect(isVcalendarButtonShown(storage)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("хранилище бросает — кнопка на месте", () => {
    const broken = {
      getItem: () => {
        throw new Error("private");
      },
    };
    expect(isVcalendarButtonShown(broken)).toBe(true);
  });
});
