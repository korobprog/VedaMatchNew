import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkBoardTitleRow } from "./board-title-row";

/* VED-589: «Убери зачёркнутую надпись. Помести заголовок VedaMatch в центр
   строки». */
describe("WorkBoardTitleRow", () => {
  it("название — средняя из трёх колонок, крайние равной ширины", () => {
    render(
      <WorkBoardTitleRow
        name="VedaMatch"
        end={<button type="button">Оплата</button>}
      />,
    );
    const title = screen.getByRole("heading", { level: 1, name: "VedaMatch" });
    const row = title.parentElement!;
    expect(row).toHaveClass("grid", "grid-cols-[1fr_auto_1fr]");
    expect(title).toHaveClass("text-center");
    const [left, middle, end] = [...row.children];
    // «Назад» убран (VED-681): путь наверх — в крошках, колонка пустая.
    expect(left).toBeEmptyDOMElement();
    expect(middle).toBe(title);
    expect(end).toContainElement(
      screen.getByRole("button", { name: "Оплата" }),
    );
    expect(end).toHaveClass("justify-self-end");
  });

  it("без кнопки справа колонка остаётся — название не съезжает вправо", () => {
    render(<WorkBoardTitleRow name="VedaMatch" />);
    const row = screen.getByRole("heading", { level: 1 }).parentElement!;
    expect(row.children).toHaveLength(3);
  });

  it("префикса задач в строке нет", () => {
    render(<WorkBoardTitleRow name="VedaMatch" />);
    const row = screen.getByRole("heading", { level: 1 }).parentElement!;
    expect(row).toHaveTextContent(/^VedaMatch$/);
  });
});
