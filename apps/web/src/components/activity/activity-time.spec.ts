import { describe, expect, it } from "vitest";
import { formatActivityTime } from "./activity-time";

const now = new Date("2026-08-24T12:00:00.000Z");

describe("formatActivityTime", () => {
  it("collapses anything under a minute to 'только что'", () => {
    expect(formatActivityTime(now.toISOString(), now)).toBe("только что");
    expect(
      formatActivityTime(new Date(now.getTime() - 30_000).toISOString(), now),
    ).toBe("только что");
  });

  it("shows whole minutes under an hour", () => {
    expect(
      formatActivityTime(new Date(now.getTime() - 5 * 60_000).toISOString(), now),
    ).toBe("5 мин");
  });

  it("shows whole hours under a day", () => {
    expect(
      formatActivityTime(
        new Date(now.getTime() - 3 * 60 * 60_000).toISOString(),
        now,
      ),
    ).toBe("3 ч");
  });

  it("names yesterday instead of '24 ч'", () => {
    expect(
      formatActivityTime(
        new Date(now.getTime() - 26 * 60 * 60_000).toISOString(),
        now,
      ),
    ).toBe("вчера");
  });

  it("counts days for the rest of the week", () => {
    expect(
      formatActivityTime(
        new Date(now.getTime() - 3 * 24 * 60 * 60_000).toISOString(),
        now,
      ),
    ).toBe("3 дн");
  });

  it("treats a future timestamp as 'только что' instead of a negative duration", () => {
    expect(
      formatActivityTime(new Date(now.getTime() + 60_000).toISOString(), now),
    ).toBe("только что");
  });
});
