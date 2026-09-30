import { describe, expect, it } from "vitest";
import {
  TEXT_HISTORY_GROUP_MS,
  createTextHistory,
  recordText,
  redoText,
  undoText,
} from "./text-history";

/* VED-679: «Отменить» и «Вернуть» у описания карточки. */
describe("история правок описания", () => {
  it("набор подряд — один шаг, после паузы — новый", () => {
    let h = createTextHistory("");
    h = recordText(h, "а", 1000);
    h = recordText(h, "аб", 1100);
    h = recordText(h, "абв", 1200);
    h = recordText(h, "абв г", 1200 + TEXT_HISTORY_GROUP_MS + 1);
    expect(h.past).toEqual(["", "абв"]);
    h = undoText(h);
    expect(h.present).toBe("абв");
    h = undoText(h);
    expect(h.present).toBe("");
    expect(undoText(h)).toBe(h);
  });

  it("«Вернуть» возвращает отменённое, новая правка его стирает", () => {
    let h = recordText(createTextHistory("старое"), "новое", 1000);
    h = undoText(h);
    expect(h.present).toBe("старое");
    h = redoText(h);
    expect(h.present).toBe("новое");
    expect(redoText(h)).toBe(h);
    h = recordText(undoText(h), "третье", 1001);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual(["старое"]);
  });

  it("правка сразу после отмены — отдельный шаг, не склейка", () => {
    let h = recordText(createTextHistory("a"), "ab", 1000);
    h = undoText(h);
    h = recordText(h, "ac", 1010);
    expect(undoText(h).present).toBe("a");
  });
});
