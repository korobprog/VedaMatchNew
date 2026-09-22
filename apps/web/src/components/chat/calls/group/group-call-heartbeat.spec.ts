import { describe, expect, it } from "vitest";
import {
  GROUP_CALL_HEARTBEAT_MS,
  GROUP_CALL_TTL_MS,
  HEARTBEAT_FAILURES_BEFORE_LOST,
  heartbeatLost,
} from "./group-call-heartbeat";

describe("подтверждение присутствия", () => {
  it("тайм-аут сервера — ровно три подтверждения подряд", () => {
    expect(HEARTBEAT_FAILURES_BEFORE_LOST).toBe(3);
    expect(HEARTBEAT_FAILURES_BEFORE_LOST * GROUP_CALL_HEARTBEAT_MS).toBe(
      GROUP_CALL_TTL_MS,
    );
  });

  it("короткая просадка сети звонок не рвёт", () => {
    expect(heartbeatLost(0)).toBe(false);
    expect(heartbeatLost(1)).toBe(false);
    expect(heartbeatLost(2)).toBe(false);
  });

  it("три пропуска подряд — сервер нас уже убрал", () => {
    expect(heartbeatLost(3)).toBe(true);
    expect(heartbeatLost(7)).toBe(true);
  });
});
