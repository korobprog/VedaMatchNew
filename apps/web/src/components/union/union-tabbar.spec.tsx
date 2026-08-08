import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnionTabBar } from "./union-tabbar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/union/likes",
}));

describe("UnionTabBar", () => {
  it("renders every section and marks the current one", () => {
    render(<UnionTabBar />);

    for (const label of ["Анкеты", "Подборки", "Лайки", "Чаты", "Профиль"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Лайки" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the likes counter and the unread chats dot only when there is something to show", () => {
    const { rerender } = render(<UnionTabBar />);

    expect(screen.queryByLabelText(/Новых лайков/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Есть непрочитанные сообщения"),
    ).not.toBeInTheDocument();

    rerender(<UnionTabBar incomingPending={3} hasUnreadChats />);

    expect(screen.getByLabelText("Новых лайков: 3")).toHaveTextContent("3");
    expect(
      screen.getByLabelText("Есть непрочитанные сообщения"),
    ).toBeInTheDocument();
  });

  it("caps the likes counter at 99+", () => {
    render(<UnionTabBar incomingPending={120} />);

    expect(screen.getByLabelText("Новых лайков: 120")).toHaveTextContent("99+");
  });
});
