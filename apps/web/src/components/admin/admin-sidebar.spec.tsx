import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminSidebar } from "./admin-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/chat/people",
}));

const groups = [
  {
    title: "Сервисы",
    items: [
      {
        href: "/admin/chat/people",
        label: "Общение — люди",
        hint: "",
        scope: "chat" as const,
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

    const toggle = screen.getByRole("button", { name: /Общение — люди/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("разворачивается и сворачивается обратно по выбору раздела", () => {
    render(<AdminSidebar groups={groups} />);
    const toggle = screen.getByRole("button", { name: /Общение — люди/ });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Выбор пункта закрывает список: на телефоне он лежит поверх содержимого,
    // и оставлять его раскрытым после перехода нечестно.
    fireEvent.click(screen.getByRole("link", { name: "Образование" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("отмечает текущий раздел для скринридера", () => {
    render(<AdminSidebar groups={groups} />);

    expect(screen.getByRole("link", { name: "Общение — люди" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
