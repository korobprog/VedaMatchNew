import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminSidebar } from "./admin-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/contacts",
}));

const groups = [
  {
    title: "Сервисы",
    items: [
      {
        href: "/admin/contacts",
        label: "Справочник",
        hint: "",
        scope: "contacts" as const,
      },
      {
        href: "/admin/library",
        label: "Образование",
        hint: "",
        scope: "library" as const,
      },
    ],
  },
];

describe("AdminSidebar", () => {
  it("на телефоне свёрнут и показывает текущий раздел на кнопке", () => {
    render(<AdminSidebar groups={groups} />);

    const toggle = screen.getByRole("button", { name: /Справочник/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("разворачивается и сворачивается обратно по выбору раздела", () => {
    render(<AdminSidebar groups={groups} />);
    const toggle = screen.getByRole("button", { name: /Справочник/ });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Выбор пункта закрывает список: на телефоне он лежит поверх содержимого,
    // и оставлять его раскрытым после перехода нечестно.
    fireEvent.click(screen.getByRole("link", { name: "Образование" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("отмечает текущий раздел для скринридера", () => {
    render(<AdminSidebar groups={groups} />);

    expect(screen.getByRole("link", { name: "Справочник" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
