import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MotivationTopBar } from "./motivation-top-bar";

describe("MotivationTopBar", () => {
  it("keeps the sections collapsed until asked", async () => {
    const user = userEvent.setup();
    render(<MotivationTopBar active="feed" isAdmin={false} />);

    const toggle = screen.getByRole("button", { name: /Вдохновение/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Разделы вдохновения" })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const nav = screen.getByRole("navigation", { name: "Разделы вдохновения" });
    expect(nav).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Админ" })).not.toBeInTheDocument();
  });

  it("uses the screen title and shows the admin section to admins", async () => {
    const user = userEvent.setup();
    render(<MotivationTopBar active="feed" isAdmin title="Свой рилс" />);

    await user.click(screen.getByRole("button", { name: /Свой рилс/ }));

    expect(screen.getByRole("link", { name: "Админ" })).toHaveAttribute("href", "/admin/motivation");
  });

  it("renders the optional action link", () => {
    render(
      <MotivationTopBar
        active="favorites"
        isAdmin={false}
        title="Избранное"
        action={{ href: "/motivation?tab=saved", label: "Рилсами" }}
      />,
    );

    expect(screen.getByRole("link", { name: "Рилсами" })).toHaveAttribute("href", "/motivation?tab=saved");
  });

  it("показывает, сколько вдохновений в сервисе", () => {
    render(<MotivationTopBar active="feed" isAdmin={false} count={348} />);

    expect(screen.getByText("348")).toBeInTheDocument();
    // Число рядом с кнопкой, а не внутри: иначе скринридер сообщал бы его
    // каждый раз, когда до кнопки доходит фокус.
    expect(
      screen.getByRole("button", { name: /Вдохновение/ }).textContent,
    ).not.toContain("348");
  });

  it("не рисует пустую цифру, пока публикаций нет", () => {
    const { container } = render(
      <MotivationTopBar active="feed" isAdmin={false} count={0} />,
    );

    expect(container.querySelector(".font-mono")).toBeNull();
  });
});
