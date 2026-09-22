import { describe, expect, it } from "vitest";
import {
  PORTAL_SEQ_KEY,
  historyEntrySeq,
  historyStepDirection,
} from "./portal-history-seq";

describe("historyEntrySeq", () => {
  it("берёт номер, который портал положил рядом с состоянием роутера", () => {
    expect(historyEntrySeq({ tree: "…", [PORTAL_SEQ_KEY]: 7 })).toBe(7);
  });

  it("чужая или пустая запись номера не имеет", () => {
    expect(historyEntrySeq(null)).toBeNull();
    expect(historyEntrySeq({})).toBeNull();
    expect(historyEntrySeq({ [PORTAL_SEQ_KEY]: "7" })).toBeNull();
    expect(historyEntrySeq("строка")).toBeNull();
  });
});

describe("historyStepDirection", () => {
  it("меньший номер — шаг назад, больший — вперёд", () => {
    expect(historyStepDirection(3, 4)).toBe(-1);
    expect(historyStepDirection(5, 4)).toBe(1);
  });

  it("тот же номер — назад: истории вперёд не бывает без нового номера", () => {
    expect(historyStepDirection(4, 4)).toBe(-1);
  });

  it("запись без номера считается шагом назад", () => {
    // Запись из прошлой жизни вкладки или чужая. «Назад» — единственная
    // кнопка, которой пользуются на телефоне (VED-354).
    expect(historyStepDirection(undefined, 4)).toBe(-1);
    expect(historyStepDirection("2", 4)).toBe(-1);
    expect(historyStepDirection(Number.NaN, 4)).toBe(-1);
    expect(historyStepDirection(2, null)).toBe(-1);
  });
});
