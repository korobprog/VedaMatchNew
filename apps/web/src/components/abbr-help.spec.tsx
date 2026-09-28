import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LineageLabel, WithLineageHelp } from "./abbr-help";

/* VED-634: «рядом с аббревиатурой значок вопроса, и при нажатии на него
   появляется расшифровка». */
describe("LineageLabel (VED-634)", () => {
  it("аббревиатура с «?», расшифровка по нажатию и с клавиатуры", async () => {
    render(<LineageLabel text="Гаудия-матх — IPBYS" />);
    const help = screen.getByRole("button", { name: "Что такое IPBYS" });
    const expansion = screen.getByText(
      "Международное общество чистой бхакти-йоги",
    );
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(expansion).not.toBeVisible();

    help.focus();
    await userEvent.keyboard("{Enter}");
    expect(help).toHaveAttribute("aria-expanded", "true");
    expect(expansion).toBeVisible();

    await userEvent.click(help);
    expect(expansion).not.toBeVisible();
  });

  it("без аббревиатуры — просто текст, без кнопки", () => {
    render(<LineageLabel text="Паривары" />);
    expect(screen.getByText("Паривары")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("WithLineageHelp (VED-634)", () => {
  it("«?» рядом с пунктом выбора не выбирает его", async () => {
    const choose = vi.fn();
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <WithLineageHelp text="ISKCON">
          <button type="button" onClick={choose}>
            ISKCON
          </button>
        </WithLineageHelp>
      </div>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Что такое ISKCON" }),
    );
    expect(choose).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
    expect(
      screen.getByText("Международное общество сознания Кришны"),
    ).toBeVisible();
  });
});
