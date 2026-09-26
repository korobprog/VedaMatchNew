import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { BoardHint } from "./board-hint";

/* VED-323: «Добавь клавишу — свернуть пояснение». */
describe("BoardHint", () => {
  beforeEach(() => window.localStorage.clear());

  it("сворачивается, запоминает это и разворачивается обратно", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BoardHint>Карточки собраны по дате</BoardHint>);

    await user.click(
      screen.getByRole("button", { name: "Свернуть пояснение" }),
    );
    expect(
      screen.queryByText("Карточки собраны по дате"),
    ).not.toBeInTheDocument();
    unmount();

    render(<BoardHint>Карточки собраны по дате</BoardHint>);
    const expand = await screen.findByRole("button", { name: "Пояснение" });
    await user.click(expand);
    expect(screen.getByText("Карточки собраны по дате")).toBeInTheDocument();
  });
});
