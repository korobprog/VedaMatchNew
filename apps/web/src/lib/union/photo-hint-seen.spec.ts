import { describe, expect, it, vi } from "vitest";
import {
  getPhotoHintServerSnapshot,
  isPhotoHintSeen,
  photoHintKey,
  rememberPhotoHintSeen,
  subscribePhotoHint,
} from "./photo-hint-seen";

function storage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    data,
  };
}

describe("isPhotoHintSeen", () => {
  it("is false until the hint has been shown", () => {
    expect(isPhotoHintSeen(storage())).toBe(false);
    expect(isPhotoHintSeen(storage({ [photoHintKey]: "1" }))).toBe(true);
  });

  // Приватный режим бросает на доступе к хранилищу: лишний показ безобиднее
  // пропущенного, поэтому считаем, что человек подсказку не видел.
  it("treats a throwing storage as not seen", () => {
    expect(
      isPhotoHintSeen({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBe(false);
  });
});

describe("rememberPhotoHintSeen", () => {
  it("writes the flag and notifies subscribers", () => {
    const store = storage();
    const listener = vi.fn();
    const unsubscribe = subscribePhotoHint(listener);
    rememberPhotoHintSeen(store);
    expect(store.data[photoHintKey]).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    rememberPhotoHintSeen(store);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("survives a storage that refuses to write", () => {
    expect(() =>
      rememberPhotoHintSeen({
        setItem: () => {
          throw new Error("denied");
        },
      }),
    ).not.toThrow();
  });
});

// До гидратации решать нечем, поэтому сервер считает подсказку показанной —
// иначе она мигнула бы на первом кадре и исчезла.
describe("getPhotoHintServerSnapshot", () => {
  it("reports the hint as already seen", () => {
    expect(getPhotoHintServerSnapshot()).toBe(true);
  });
});
