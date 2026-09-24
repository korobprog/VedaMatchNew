import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnionRecommendation } from "@vedamatch/shared";
import { RecommendationsView } from "./recommendations-view";

// Колода и плитка здесь не проверяются — только вход в просмотр и выход.
vi.mock("./swipe-deck", () => ({
  SwipeDeck: ({ onExit }: { onExit?: () => void }) => (
    <button type="button" onClick={onExit}>
      Выйти
    </button>
  ),
}));

vi.mock("./recommendation-tile", () => ({
  RecommendationTile: ({ onOpen }: { onOpen: () => void }) => (
    <button type="button" onClick={onOpen}>
      Открыть анкету
    </button>
  ),
}));

vi.mock("./recommendation-card", () => ({
  RecommendationCard: () => <div />,
}));

const item = { user: { id: "user-1" } } as UnionRecommendation;

function mockMobile(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

describe("RecommendationsView focus mode", () => {
  let pushState: ReturnType<typeof vi.spyOn>;
  let back: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pushState = vi.spyOn(window.history, "pushState");
    back = vi.spyOn(window.history, "back").mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("closes the auto-opened phone deck without leaving the page", () => {
    mockMobile(true);
    render(<RecommendationsView items={[item]} />);

    // Колода открылась сама — без жеста запись в истории не ставим.
    expect(pushState).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    expect(back).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Открыть анкету" }),
    ).toBeInTheDocument();
  });

  it("opens by tap with a history entry and closes by going back", () => {
    mockMobile(true);
    render(<RecommendationsView items={[item]} />);
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    fireEvent.click(screen.getByRole("button", { name: "Открыть анкету" }));
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
    });

    expect(back).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Открыть анкету" }),
    ).toBeInTheDocument();
  });

  it("closes by Escape through the same exit", () => {
    mockMobile(true);
    render(<RecommendationsView items={[item]} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(back).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Открыть анкету" }),
    ).toBeInTheDocument();
  });
});
