import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BlogBlankLinesTool } from "./blog-blank-lines-tool";

/** Поле и инструмент вместе — так, как они стоят в форме поста. */
function Harness({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  return (
    <>
      <label htmlFor="t">Текст</label>
      <textarea id="t" value={text} onChange={(e) => setText(e.target.value)} />
      <BlogBlankLinesTool value={text} onChange={setText} />
    </>
  );
}

const MESSY = "Раз\n   \n\t\nДва\n\n\n\nТри";

async function remove(
  user: ReturnType<typeof userEvent.setup>,
  choice: string,
) {
  await user.click(screen.getByRole("button", { name: "Убрать пустые строки" }));
  await user.click(screen.getByRole("button", { name: choice }));
}

describe("BlogBlankLinesTool (VED-372, VED-633)", () => {
  it("is one button; how many lines to remove is in its menu", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} />);
    const field = screen.getByLabelText("Текст");

    // Сам по себе инструмент текст не трогает, и развёрнутого поля нет.
    expect(field).toHaveValue(MESSY);
    expect(screen.queryByRole("combobox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Убрать пустые строки" }));
    const menu = screen.getByRole("group", {
      name: "Сколько пустых строк убрать между абзацами",
    });
    expect(menu).toHaveTextContent(
      "Убрать 1 строкуУбрать 2 строкиУбрать 3 строкиУбрать все",
    );

    await user.click(screen.getByRole("button", { name: "Убрать все" }));
    expect(field).toHaveValue("Раз\nДва\nТри");
    expect(screen.getByRole("status")).toHaveTextContent("Убрано 5 пустых строк.");
  });

  it("removes as many lines from each gap as chosen", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} />);

    await remove(user, "Убрать 1 строку");
    expect(screen.getByLabelText("Текст")).toHaveValue("Раз\n\nДва\n\n\nТри");
  });

  it("gives the original text back, even after several steps", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} />);

    await remove(user, "Убрать 1 строку");
    await remove(user, "Убрать 1 строку");
    await user.click(screen.getByRole("button", { name: "Вернуть как было" }));

    expect(screen.getByLabelText("Текст")).toHaveValue(MESSY);
    expect(screen.getByRole("status")).toHaveTextContent("Текст возвращён как был.");
    expect(screen.queryByRole("button", { name: "Вернуть как было" })).toBeNull();
  });

  // Вернуть «как было» поверх дописанного значит стереть новые слова.
  it("drops the undo and the stale note once the text is edited by hand", async () => {
    const user = userEvent.setup();
    render(<Harness initial={MESSY} />);

    await remove(user, "Убрать все");
    await user.type(screen.getByLabelText("Текст"), "!");

    expect(screen.queryByRole("button", { name: "Вернуть как было" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("says so when there is nothing to remove, and changes nothing", async () => {
    const user = userEvent.setup();
    render(<Harness initial={"Раз\nДва"} />);

    await remove(user, "Убрать 2 строки");
    expect(screen.getByLabelText("Текст")).toHaveValue("Раз\nДва");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Пустых строк между абзацами не нашлось.",
    );
    expect(screen.queryByRole("button", { name: "Вернуть как было" })).toBeNull();
  });
});
