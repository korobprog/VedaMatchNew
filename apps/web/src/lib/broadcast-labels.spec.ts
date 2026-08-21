import { describe, expect, it } from "vitest";
import { broadcastStatusLabels, describeAudience } from "./broadcast-labels";

describe("describeAudience", () => {
  it("пустой фильтр — вся живая аудитория", () => {
    expect(describeAudience({})).toBe("Все активные аккаунты");
    expect(describeAudience({ stages: [], roles: [] })).toBe(
      "Все активные аккаунты",
    );
  });

  it("перечисляет этапы человеческими названиями", () => {
    expect(describeAudience({ stages: ["seeker", "devotee"] })).toBe(
      "Ищущий, Преданный",
    );
  });

  it("показывает роли", () => {
    expect(describeAudience({ roles: ["service-admin"] })).toBe(
      "Админ сервиса",
    );
  });

  it("различает плательщиков и остальных", () => {
    expect(describeAudience({ payment: "paid" })).toBe("платят");
    expect(describeAudience({ payment: "unpaid" })).toBe("не платят");
  });

  it("склеивает условия через разделитель", () => {
    expect(
      describeAudience({
        stages: ["yogi"],
        payment: "paid",
        withPushOnly: true,
      }),
    ).toBe("Йог · платят · только с включённым пушем");
  });
});

describe("broadcastStatusLabels", () => {
  it("покрывает все статусы рассылки", () => {
    expect(Object.keys(broadcastStatusLabels).sort()).toEqual([
      "cancelled",
      "draft",
      "failed",
      "sending",
      "sent",
    ]);
  });
});
