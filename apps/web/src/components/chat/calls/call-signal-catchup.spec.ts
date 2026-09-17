import { describe, expect, it } from "vitest";
import {
  admitCallSignal,
  INITIAL_SIGNAL_SEQ_STATE,
  shouldCatchUpCallSignals,
} from "./call-signal-catchup";

describe("admitCallSignal", () => {
  it("первый сигнал с seq=1 всегда применяется", () => {
    const result = admitCallSignal(INITIAL_SIGNAL_SEQ_STATE, 1);
    expect(result).toEqual({ admit: true, next: { lastSeq: 1 } });
  });

  it("возрастающий seq применяется и сдвигает lastSeq", () => {
    const first = admitCallSignal(INITIAL_SIGNAL_SEQ_STATE, 3);
    const second = admitCallSignal(first.next, 5);
    expect(second).toEqual({ admit: true, next: { lastSeq: 5 } });
  });

  it("повтор того же seq (пришёл и по SSE, и дочитан) отбрасывается", () => {
    const state = { lastSeq: 5 };
    expect(admitCallSignal(state, 5)).toEqual({ admit: false, next: state });
  });

  it("seq меньше уже применённого (доставка вперемешку) отбрасывается", () => {
    const state = { lastSeq: 5 };
    expect(admitCallSignal(state, 2)).toEqual({ admit: false, next: state });
  });

  it("сигнал без seq (старое событие) применяется без изменения счётчика", () => {
    const state = { lastSeq: 5 };
    expect(admitCallSignal(state, undefined)).toEqual({ admit: true, next: state });
  });
});

describe("shouldCatchUpCallSignals", () => {
  it("да — connecting и active", () => {
    expect(shouldCatchUpCallSignals("connecting")).toBe(true);
    expect(shouldCatchUpCallSignals("active")).toBe(true);
  });

  it("нет — idle, outgoing, incoming, ended", () => {
    for (const phase of ["idle", "outgoing", "incoming", "ended"])
      expect(shouldCatchUpCallSignals(phase)).toBe(false);
  });
});
