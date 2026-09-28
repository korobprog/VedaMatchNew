import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FeaturedColorPicker } from "./featured-color-picker";
import {
  HOME_FEATURED_COLORS_COOKIE,
  parseFeaturedColors,
} from "./featured-accents";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// jsdom не реализует showModal.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

afterEach(() => {
  document.cookie = `${HOME_FEATURED_COLORS_COOKIE}=; path=/; max-age=0`;
  refresh.mockClear();
});

function saved() {
  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${HOME_FEATURED_COLORS_COOKIE}=`))
    ?.slice(HOME_FEATURED_COLORS_COOKIE.length + 1);
  return parseFeaturedColors(raw, "u1");
}

describe("FeaturedColorPicker (VED-452)", () => {
  it("кружок назван текущим цветом и открывает выбор с клавиатуры", async () => {
    const user = userEvent.setup();
    render(
      <FeaturedColorPicker
        userId="u1"
        serviceName="Общение"
        index={0}
        accents={["text-cyan", "text-violet", "text-magenta"]}
      />,
    );

    const dot = screen.getByRole("button", { name: "Цвет кнопки: мятный" });
    dot.focus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("dialog", { name: "Цвет кнопки «Общение»" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "мятный" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const name of ["золотой", "синий", "салатовый"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("выбор пишет cookie; занятый соседом цвет меняется местами", async () => {
    const user = userEvent.setup();
    render(
      <FeaturedColorPicker
        userId="u1"
        serviceName="Медиатека"
        index={1}
        accents={["text-cyan", "text-violet", "text-magenta"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Цвет кнопки/ }));
    await user.click(screen.getByRole("button", { name: "мятный" }));

    expect(saved()).toEqual(["text-violet", "text-cyan", "text-magenta"]);
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
