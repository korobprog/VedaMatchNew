import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LibraryContents } from "./library-contents";

afterEach(() => vi.unstubAllGlobals());

function stubFeed() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
}

describe("LibraryContents", () => {
  /* VED-521: у автора «Содержание» — значком в ряду действий, а список
     раскрывается под рядом своей строкой. */
  it("значком: кнопка с подписью для скринридера, список — соседом", () => {
    stubFeed();
    const { container } = render(
      <div data-testid="row">
        <LibraryContents locale="ru" categorySlug="ari" iconOnly />
      </div>,
    );

    const button = screen.getByRole("button", { name: "Содержание" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.textContent).toBe("");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = container.querySelector("#library-contents");
    expect(panel?.parentElement).toBe(screen.getByTestId("row"));
    expect(panel).toHaveClass("order-last", "w-full");
    expect(screen.getByText("Загружаю содержание…")).toBeInTheDocument();
  });

  it("надписью — как раньше, кнопка с текстом", () => {
    stubFeed();
    render(<LibraryContents locale="ru" />);

    expect(
      screen.getByRole("button", { name: "Содержание" }).textContent,
    ).toContain("Содержание");
  });
});
