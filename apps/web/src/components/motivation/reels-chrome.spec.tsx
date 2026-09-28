import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ReelsChrome } from "./reels-chrome";

describe("ReelsChrome", () => {
  // VED-252: кружок-подложка убран, но кнопки остаются доступны по имени и
  // с невидимой областью нажатия ≥ 40px (`size-10`), несмотря на то что
  // видимая иконка стала мельче.
  it("кнопки «←» и меню разделов доступны по имени, без круглой подложки", () => {
    render(<ReelsChrome isAdmin={false} />);

    const back = screen.getByRole("link", { name: "Назад на портал" });
    expect(back).toHaveAttribute("href", "/");
    expect(back.className).not.toMatch(/rounded-full|bg-black/);
    expect(back.className).toMatch(/size-10/);

    const menu = screen.getByRole("button", { name: "Разделы Вдохновения" });
    expect(menu.className).not.toMatch(/rounded-full|bg-black/);
    expect(menu.className).toMatch(/size-10/);
  });

  // VED-599: ← и ☰ придвинуты к краям — поле нажатия вплотную к краю.
  it("кнопки «←» и меню стоят вплотную к краям", () => {
    render(<ReelsChrome isAdmin={false} />);

    expect(screen.getByRole("link", { name: "Назад на портал" })).toHaveClass("left-0");
    expect(screen.getByRole("button", { name: "Разделы Вдохновения" })).toHaveClass(
      "right-0",
    );
  });

  it("открывает разделы по нажатию на кнопку меню", async () => {
    const user = userEvent.setup();
    render(<ReelsChrome isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "Разделы Вдохновения" }));

    expect(screen.getByRole("button", { name: "Закрыть разделы" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вперемешку" })).toBeInTheDocument();
  });
});
