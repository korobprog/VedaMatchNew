import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnionLocationOnboarding } from "./union-location-onboarding";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("UnionLocationOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a selected city and saves its country and coordinates", async () => {
    const location = {
      city: "Хабаровск",
      country: "Россия",
      lat: 48.4813,
      lon: 135.0763,
      displayName: "Хабаровск, Хабаровский край, Россия",
      type: "city",
    };
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/geo/search")) {
        return Promise.resolve(
          new Response(JSON.stringify([location]), { status: 200 }),
        );
      }
      if (url.endsWith("/profile") && init?.method === "PATCH") {
        return Promise.resolve(
          new Response(JSON.stringify({ homeLocation: location }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<UnionLocationOnboarding />);

    const submit = screen.getByRole("button", {
      name: "Сохранить и продолжить",
    });
    expect(submit).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Страна" }), "Россия");
    await user.type(
      screen.getByRole("textbox", { name: "Город" }),
      "Хабаровск",
    );
    await user.click(
      await screen.findByRole("button", {
        name: /Хабаровск.*Россия/,
      }),
    );
    await user.click(submit);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/profile$/),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ homeLocation: location }),
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/union");
    expect(refresh).toHaveBeenCalled();
  });
});
