import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MotivationRailSettings } from "./rail-settings";
import { RAIL_STORAGE_KEY, parseRailConfig } from "./rail-actions";

function stored() {
  return parseRailConfig(window.localStorage.getItem(RAIL_STORAGE_KEY));
}

describe("MotivationRailSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("показывает заводской ряд и то, что можно добавить", () => {
    render(<MotivationRailSettings />);

    expect(screen.getByText("1. Нравится")).toBeInTheDocument();
    expect(screen.getByText("7. Создать")).toBeInTheDocument();
    // Не в ряду по умолчанию — три: их и предлагаем добавить.
    expect(
      screen.getByRole("button", { name: "Добавить «Категории» в ряд" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Добавить «Случайный» в ряд" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Добавить «Настройки» в ряд" }),
    ).toBeInTheDocument();
  });

  it("убранная кнопка уходит из ряда и запоминается", async () => {
    const user = userEvent.setup();
    render(<MotivationRailSettings />);

    await user.click(
      screen.getByRole("button", { name: "Убрать «Озвучить» из ряда" }),
    );

    expect(stored()).toEqual(["like", "save", "share", "hide", "edit", "create"]);
    expect(
      screen.getByRole("button", { name: "Добавить «Озвучить» в ряд" }),
    ).toBeInTheDocument();
  });

  it("добавленная встаёт в конец ряда", async () => {
    const user = userEvent.setup();
    render(<MotivationRailSettings />);

    await user.click(
      screen.getByRole("button", { name: "Добавить «Случайный» в ряд" }),
    );

    expect(stored().at(-1)).toBe("random");
    expect(screen.getByText("8. Случайный")).toBeInTheDocument();
  });

  it("стрелка меняет порядок", async () => {
    const user = userEvent.setup();
    render(<MotivationRailSettings />);

    await user.click(
      screen.getByRole("button", { name: "Передвинуть «Сохранить» левее" }),
    );

    expect(stored().slice(0, 2)).toEqual(["save", "like"]);
    expect(screen.getByText("1. Сохранить")).toBeInTheDocument();
  });

  it("крайняя кнопка не двигается за край", () => {
    render(<MotivationRailSettings />);

    expect(
      screen.getByRole("button", { name: "Передвинуть «Нравится» левее" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Передвинуть «Создать» правее" }),
    ).toBeDisabled();
  });

  it("«Вернуть как было» восстанавливает заводской ряд", async () => {
    const user = userEvent.setup();
    render(<MotivationRailSettings />);

    await user.click(
      screen.getByRole("button", { name: "Убрать «Нравится» из ряда" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Убрать «Сохранить» из ряда" }),
    );
    await user.click(screen.getByRole("button", { name: /Вернуть как было/ }));

    expect(stored()).toEqual([
      "like",
      "save",
      "share",
      "hide",
      "speak",
      "edit",
      "create",
    ]);
  });

  it("пустой ряд объясняется словами, а не пустым местом", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(RAIL_STORAGE_KEY, JSON.stringify(["like"]));
    render(<MotivationRailSettings />);

    await user.click(
      screen.getByRole("button", { name: "Убрать «Нравится» из ряда" }),
    );

    expect(
      screen.getByText(/Ряд пуст — под афоризмом не будет ни одной кнопки/),
    ).toBeInTheDocument();
  });

  it("читает раскладку, сохранённую на устройстве", () => {
    window.localStorage.setItem(
      RAIL_STORAGE_KEY,
      JSON.stringify(["share", "like"]),
    );
    render(<MotivationRailSettings />);

    const list = screen.getAllByRole("list")[0];
    expect(within(list).getByText("1. Поделиться")).toBeInTheDocument();
    expect(within(list).getByText("2. Нравится")).toBeInTheDocument();
  });
});
