import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MusicBlankLinesTool } from "./music-blank-lines-tool";

function Field({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <pre data-testid="value">{value}</pre>
      <MusicBlankLinesTool
        label="Текст бхаджана"
        value={value}
        onChange={setValue}
      />
    </>
  );
}

/* VED-477: уборка пустых строк в тексте записи. */
describe("MusicBlankLinesTool", () => {
  it("оставляет одну пустую строку между куплетами и умеет вернуть как было", async () => {
    const user = userEvent.setup();
    render(<Field initial={"Куплет 1\n\n\n\nКуплет 2"} />);

    await user.click(
      screen.getByRole("button", {
        name: /Убрать пустые строки.*Текст бхаджана/,
      }),
    );
    expect(screen.getByTestId("value").textContent).toBe(
      "Куплет 1\n\nКуплет 2",
    );
    expect(screen.getByRole("status").textContent).toMatch(/Убрано 2/);

    await user.click(screen.getByRole("button", { name: "Вернуть как было" }));
    expect(screen.getByTestId("value").textContent).toBe(
      "Куплет 1\n\n\n\nКуплет 2",
    );
  });
});
