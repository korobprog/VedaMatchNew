import { describe, expect, it } from "vitest";
import { BOARD_REFRESH_MS, shouldApplyBoardRefresh } from "./board-refresh";

describe("shouldApplyBoardRefresh", () => {
  const calm = { startedAt: 3, current: 3, pendingMoves: 0, dragging: false };

  it("подставляет свежую доску, когда человек ничего не трогал", () => {
    expect(shouldApplyBoardRefresh(calm)).toBe(true);
  });

  it("не затирает собственную правку, сделанную, пока шёл запрос", () => {
    // Иначе только что перенесённая карточка прыгнула бы обратно.
    expect(shouldApplyBoardRefresh({ ...calm, current: 4 })).toBe(false);
  });

  it("ждёт, пока перенос долетит до сервера", () => {
    expect(shouldApplyBoardRefresh({ ...calm, pendingMoves: 1 })).toBe(false);
  });

  it("не перестраивает доску под пальцем", () => {
    expect(shouldApplyBoardRefresh({ ...calm, dragging: true })).toBe(false);
  });
});

describe("BOARD_REFRESH_MS", () => {
  it("минута — как у колокольчика уведомлений", () => {
    expect(BOARD_REFRESH_MS).toBe(60_000);
  });
});
