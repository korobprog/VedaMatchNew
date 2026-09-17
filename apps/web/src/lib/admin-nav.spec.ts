import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  canOpenAdminSection,
  currentAdminNavLabel,
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

  // VED-42: журнал действий — особый scope "staff", открыт любому
  // администратору с хотя бы одним сервисом, не только полному admin.
  // Содержимое внутри уже отфильтровано бэкендом по его сервисам.
  it("журнал действий открыт админу сервиса, а не только порталу", () => {
    expect(canOpenAdminSection({ role: "admin" }, "staff")).toBe(true);
    expect(
      canOpenAdminSection(
        { role: "service-admin", adminServices: ["notices"] },
        "staff",
      ),
    ).toBe(true);
  });

  it("журнал действий недоступен пользователю без единого сервиса", () => {
    expect(
      canOpenAdminSection({ role: "service-admin", adminServices: [] }, "staff"),
    ).toBe(false);
    expect(canOpenAdminSection({ role: "user" }, "staff")).toBe(false);
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

  it("админу сервиса оставляет только его сервис, убирает пустые группы, но оставляет журнал", () => {
    const groups = visibleAdminNav({
      role: "service-admin",
      adminServices: ["market"],
    });

    // «Платформа» остаётся в списке групп из-за пункта «Журнал действий»
    // (scope "staff"), но остальные её пункты (Рассылки, Каталог сервисов и
    // т.д.) по-прежнему видны только полному admin — их тут быть не должно.
    expect(groups.map((group) => group.title)).toEqual(["Сервисы", "Платформа"]);
    expect(groups[0].items.map((item) => item.href)).toEqual(["/admin/market"]);
    expect(groups[1].items.map((item) => item.href)).toEqual(["/admin/audit"]);
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

describe("currentAdminNavLabel", () => {
  const groups = visibleAdminNav({ role: "admin" });

  it("называет раздел, в котором человек находится", () => {
    expect(currentAdminNavLabel(groups, "/admin/chat/people")).toBe(
      "Общение — люди",
    );
  });

  it("выбирает вложенный раздел, а не родительский", () => {
    // «Общение — люди» лежит внутри «Общения»: без выбора самого длинного
    // совпадения на кнопке стояло бы название родителя.
    expect(currentAdminNavLabel(groups, "/admin/chat")).toBe("Общение");
    expect(currentAdminNavLabel(groups, "/admin/chat/people/profiles")).toBe(
      "Общение — люди",
    );
  });

  it("держит название на вложенной вкладке сервиса", () => {
    expect(currentAdminNavLabel(groups, "/admin/motivation/queue")).toBe(
      "Вдохновение",
    );
  });

  it("на главной админки — «Обзор»", () => {
    expect(currentAdminNavLabel(groups, "/admin")).toBe("Обзор");
  });
});

describe("раздел «Вакансии»", () => {
  const items = ADMIN_NAV.flatMap((group) => group.items);
  const vacancies = items.find((item) => item.href === "/admin/vacancies");

  it("есть в навигации и открывается админу сервиса vacancies", () => {
    expect(vacancies).toBeDefined();
    expect(vacancies?.scope).toBe("vacancies");
    const user = {
      role: "service-admin" as const,
      adminServices: ["vacancies"],
    };
    expect(canOpenAdminSection(user, "vacancies")).toBe(true);
    expect(
      visibleAdminNav(user)
        .flatMap((group) => group.items)
        .map((item) => item.href),
    ).toEqual(["/admin/vacancies", "/admin/audit"]);
  });
});
