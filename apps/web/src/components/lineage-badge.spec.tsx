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

  /* VED-634: «рядом с аббревиатурой значок вопроса, при нажатии на него
     появляется расшифровка». */
  it("ISKCON — аббревиатура, расшифровка по «?»", async () => {
    render(<LineageBadge lineage="iskcon" />);
    expect(screen.getByText("ISKCON")).toBeInTheDocument();
    const help = screen.getByRole("button", { name: "Что такое ISKCON" });
    expect(
      screen.getByText("Международное общество сознания Кришны"),
    ).not.toBeVisible();
    await userEvent.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Международное общество сознания Кришны"),
    ).toBeVisible();
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
