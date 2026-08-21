import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DonateButton } from "./donate-sheet";

describe("DonateButton", () => {
  it("renders nothing when donations are off or have no requisites", () => {
    const { container, rerender } = render(<DonateButton donation={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<DonateButton donation={{ enabled: true, text: "", requisites: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the button and the sheet with every requisite", () => {
    render(
      <DonateButton
        donation={{
          enabled: true,
          text: "Спасибо за поддержку",
          requisites: [
            { kind: "sbp", label: "СБП", value: "+7 900 000-00-00" },
            { kind: "link", label: "Boosty", value: "https://boosty.to/vedamatch" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /Поддержать развитие VedaMatch/ })).toBeInTheDocument();
    expect(screen.getByText("Спасибо за поддержку")).toBeInTheDocument();
    expect(screen.getByText("+7 900 000-00-00")).toBeInTheDocument();
    // Содержимое закрытого <dialog> скрыто от дерева доступности, пока его не открыли.
    expect(screen.getByRole("link", { name: "Открыть", hidden: true })).toHaveAttribute(
      "href",
      "https://boosty.to/vedamatch",
    );
    expect(screen.getAllByRole("button", { name: "Копировать", hidden: true })).toHaveLength(1);
  });
});
