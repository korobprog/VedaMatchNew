import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LibraryLocale } from "@vedamatch/shared";
import { describe, expect, it } from "vitest";
import { BodyBlankLinesTool } from "./body-blank-lines-tool";

/** Поле и инструмент вместе — так, как они стоят в форме статьи. */
function Harness({
  initial,
  locale = "ru",
}: {
  initial: string;
  locale?: LibraryLocale;
}) {
  const [text, setText] = useState(initial);
  return (
    <>
      <label htmlFor="t">Текст</label>
      <textarea id="t" value={text} onChange={(e) => setText(e.target.value)} />
      <BodyBlankLinesTool locale={locale} value={text} onChange={setText} />
    </>
  );
}

const MESSY = "Раз\n   \n\t\nДва\n\n\n\nТри";

describe("BodyBlankLinesTool (VED-372)", () => {
  it("removes blank lines only on request and says how many", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} />);
    const field = screen.getByLabelText("Текст");

    expect(field).toHaveValue(MESSY);

    await user.click(screen.getByRole("button", { name: "Убрать пустые строки" }));
    expect(field).toHaveValue("Раз\nДва\nТри");
    expect(screen.getByRole("status")).toHaveTextContent("Убрано 5 пустых строк.");
  });

  it("keeps one blank line between paragraphs when asked", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} />);

    await user.selectOptions(screen.getByLabelText("оставлять пустых строк"), "1");
    await user.click(screen.getByRole("button", { name: "Убрать пустые строки" }));
    expect(screen.getByLabelText("Текст")).toHaveValue("Раз\n\nДва\n\nТри");
  });

  it("offers exactly the choices the server keeps", () => {
    render(<Harness initial={MESSY} />);
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["ни одной", "одну"]);
  });

  it("gives the original text back", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} />);

    await user.click(screen.getByRole("button", { name: "Убрать пустые строки" }));
    await user.click(screen.getByRole("button", { name: "Вернуть как было" }));

    expect(screen.getByLabelText("Текст")).toHaveValue(MESSY);
    expect(screen.getByRole("status")).toHaveTextContent("Текст возвращён как был.");
    expect(screen.queryByRole("button", { name: "Вернуть как было" })).toBeNull();
  });

  // Вернуть «как было» поверх дописанного значит стереть новые слова.
  it("drops the undo and the stale note once the text is edited by hand", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} />);

    await user.click(screen.getByRole("button", { name: "Убрать пустые строки" }));
    await user.type(screen.getByLabelText("Текст"), "!");

    expect(screen.queryByRole("button", { name: "Вернуть как было" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("says so when there is nothing to remove, and changes nothing", async () => {
    const user = userEvent.setup();
    render(<Harness initial={"Раз\nДва"} />);

    await user.click(screen.getByRole("button", { name: "Убрать пустые строки" }));
    expect(screen.getByLabelText("Текст")).toHaveValue("Раз\nДва");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Пустых строк между абзацами не нашлось.",
    );
    expect(screen.queryByRole("button", { name: "Вернуть как было" })).toBeNull();
  });

  it("speaks the interface language", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} locale="en" />);

    expect(screen.getByLabelText("blank lines to keep")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove blank lines" }));
    expect(screen.getByRole("status")).toHaveTextContent("Removed 5 blank lines.");
    expect(
      screen.getByRole("button", { name: "Put it back as it was" }),
    ).toBeInTheDocument();
  });
});
