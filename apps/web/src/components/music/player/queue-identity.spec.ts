import { describe, expect, it } from "vitest";
import { isSameQueue } from "./queue-identity";

describe("isSameQueue", () => {
  it("считает очередь той же при совпадении состава и порядка", () => {
    expect(isSameQueue(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
  });

  it("другой состав — другая очередь", () => {
    expect(isSameQueue(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("другая длина — другая очередь", () => {
    // Ровно случай из жалобы: играла запись из каталога (четыре записи), её же
    // нажали в плейлисте (три записи) — очередь обязана смениться.
    expect(isSameQueue(["a", "b", "c", "d"], ["a", "b", "c"])).toBe(false);
  });

  it("тот же состав в другом порядке — другая очередь", () => {
    // Порядок и есть то, ради чего очередь существует.
    expect(isSameQueue(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("кнопка без очереди очередь не меняет", () => {
    // Карточка записи и полоса плеера очередь не сообщают: у них её нет, и
    // трогать чужую они не должны.
    expect(isSameQueue(["a", "b"], undefined)).toBe(true);
    expect(isSameQueue(["a", "b"], [])).toBe(true);
  });
});
