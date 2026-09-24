import { describe, expect, it } from "vitest";
import { ringArcs } from "./status-ring-geometry";

describe("ringArcs (VED-129)", () => {
  it("нет статусов — нет кружка", () => {
    expect(ringArcs(0, 0, 60, 3)).toEqual([]);
  });

  it("один статус — одна сплошная секция", () => {
    const arcs = ringArcs(1, 1, 60, 3);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].unseen).toBe(true);
    expect(ringArcs(1, 0, 60, 3)[0].unseen).toBe(false);
  });

  it("секций столько же, сколько статусов", () => {
    expect(ringArcs(3, 3, 60, 3)).toHaveLength(3);
    expect(ringArcs(5, 0, 60, 3)).toHaveLength(5);
  });

  it("просмотренные идут первыми, зелёный хвост — непросмотренные", () => {
    expect(ringArcs(4, 1, 60, 3).map((arc) => arc.unseen)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("непросмотренных больше, чем статусов, не бывает", () => {
    expect(ringArcs(2, 5, 60, 3).every((arc) => arc.unseen)).toBe(true);
  });
});
