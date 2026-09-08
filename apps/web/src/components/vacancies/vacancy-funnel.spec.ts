import { describe, expect, it } from "vitest";
import type { VacancyResponseDto } from "@vedamatch/shared";
import { buildFunnel, funnelActions, moveInFunnel } from "./vacancy-funnel";

const response = (
  id: string,
  status: VacancyResponseDto["status"],
): VacancyResponseDto => ({
  id,
  offerId: "o1",
  offerTitle: "Повар",
  offerKind: "work",
  offerAuthorId: "author",
  status,
  message: null,
  createdAt: "2026-09-08T10:00:00Z",
  respondedAt: null,
  user: { userId: `u-${id}`, name: "Гопал", avatarUrl: null, city: null },
});

describe("buildFunnel", () => {
  it("раскладывает по колонкам, отозванные выбрасывает", () => {
    const funnel = buildFunnel([
      response("a", "new"),
      response("b", "accepted"),
      response("c", "withdrawn"),
      response("d", "new"),
    ]);
    expect(funnel.new.map((r) => r.id)).toEqual(["a", "d"]);
    expect(funnel.accepted.map((r) => r.id)).toEqual(["b"]);
    expect(funnel.declined).toEqual([]);
    expect(Object.values(funnel).flat()).toHaveLength(3);
  });
});

describe("funnelActions", () => {
  it("решение назад не ходит", () => {
    expect(funnelActions("new")).toEqual({ dialog: true, accept: true, decline: true });
    expect(funnelActions("accepted")).toEqual({ dialog: true, accept: false, decline: false });
    expect(funnelActions("declined")).toEqual({ dialog: false, accept: false, decline: false });
  });
});

describe("moveInFunnel", () => {
  it("меняет статус только у одного отклика", () => {
    const moved = moveInFunnel([response("a", "new"), response("b", "new")], "a", "accepted");
    expect(moved.map((r) => r.status)).toEqual(["accepted", "new"]);
  });
});
