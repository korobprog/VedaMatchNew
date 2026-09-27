import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LineageBadge } from "./lineage-badge";

describe("LineageBadge (VED-568)", () => {
  it("у матха видна только группа, матх раскрывается нажатием", async () => {
    render(<LineageBadge lineage="sri_gopinath_gaudiya_math" />);
    const button = screen.getByRole("button", { name: "Гаудия-матх" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Шри Гопинатх Гаудия Матх")).not.toBeVisible();

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Шри Гопинатх Гаудия Матх")).toBeVisible();

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("у паривара — общая метка «Паривары»", () => {
    render(<LineageBadge lineage="narottama_parivara" />);
    expect(
      screen.getByRole("button", { name: "Паривары" }),
    ).toBeInTheDocument();
  });

  it("ISKCON — просто текст, раскрывать нечего", () => {
    render(<LineageBadge lineage="iskcon" />);
    expect(screen.getByText("ISKCON")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("без линии — запасная подпись, подписи групп — на языке страницы", () => {
    const { rerender } = render(
      <LineageBadge lineage={null} fallback="Для всех линий" />,
    );
    expect(screen.getByText("Для всех линий")).toBeInTheDocument();

    rerender(
      <LineageBadge
        lineage="ipbys"
        groupLabels={{ gaudiya_math: "Gaudiya Math" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Gaudiya Math" }),
    ).toBeInTheDocument();
  });
});
