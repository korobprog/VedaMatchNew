import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  canOpenAdminSection,
  isAdminNavItemActive,
  visibleAdminNav,
} from "./admin-nav";

describe("canOpenAdminSection", () => {
  it("портальные разделы доступны только роли admin", () => {
    expect(canOpenAdminSection({ role: "admin" }, "portal")).toBe(true);
    expect(
      canOpenAdminSection(
        { role: "service-admin", adminServices: ["market"] },
        "portal",
      ),
    ).toBe(false);
    expect(canOpenAdminSection({ role: "user" }, "portal")).toBe(false);
  });

  it("админ сервиса открывает только выданные сервисы", () => {
    const user = { role: "service-admin" as const, adminServices: ["market"] };
    expect(canOpenAdminSection(user, "market")).toBe(true);
    expect(canOpenAdminSection(user, "motivation")).toBe(false);
  });
});

describe("visibleAdminNav", () => {
  it("админу портала показывает всё", () => {
    const groups = visibleAdminNav({ role: "admin" });
    expect(groups).toHaveLength(ADMIN_NAV.length);
    expect(groups.flatMap((group) => group.items)).toHaveLength(
      ADMIN_NAV.flatMap((group) => group.items).length,
    );
  });

  it("админу сервиса оставляет только его сервис и убирает пустые группы", () => {
    const groups = visibleAdminNav({
      role: "service-admin",
      adminServices: ["market"],
    });

    expect(groups.map((group) => group.title)).toEqual(["Сервисы"]);
    expect(groups[0].items.map((item) => item.href)).toEqual(["/admin/market"]);
  });

  it("обычному пользователю не оставляет ничего", () => {
    expect(visibleAdminNav({ role: "user" })).toEqual([]);
  });
});

describe("isAdminNavItemActive", () => {
  it("держит подсветку на вложенных вкладках сервиса", () => {
    expect(isAdminNavItemActive("/admin/motivation", "/admin/motivation")).toBe(
      true,
    );
    expect(
      isAdminNavItemActive("/admin/motivation", "/admin/motivation/queue"),
    ).toBe(true);
  });

  it("не путает разделы с общим началом пути", () => {
    expect(isAdminNavItemActive("/admin/users", "/admin/users-export")).toBe(
      false,
    );
  });

  it("главная админки подсвечивается только на самой себе", () => {
    expect(isAdminNavItemActive("/admin", "/admin")).toBe(true);
    expect(isAdminNavItemActive("/admin", "/admin/users")).toBe(false);
  });
});
