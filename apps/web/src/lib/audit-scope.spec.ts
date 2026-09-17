import { describe, expect, it } from "vitest";
import { ADMIN_AUDIT_ACTIONS } from "@vedamatch/shared";
import { actionsForServices } from "./audit-scope";

describe("actionsForServices", () => {
  it("null — ограничения нет, отдаёт весь список действий", () => {
    expect(actionsForServices(null)).toEqual(ADMIN_AUDIT_ACTIONS);
  });

  it("пустой список сервисов — пустой список действий", () => {
    expect(actionsForServices([])).toEqual([]);
  });

  it("сужает список до действий сервиса", () => {
    expect(actionsForServices(["notices"])).toEqual([
      "notices.report-resolved",
      "notices.notice-deleted",
    ]);
  });

  it("портальные действия (каталог, баллы) не просачиваются ни в один сервис", () => {
    const actions = actionsForServices(["market", "notices", "union", "chat"]);
    expect(actions).not.toContain("catalog.service-created");
    expect(actions).not.toContain("rewards.entry-revoked");
  });
});
