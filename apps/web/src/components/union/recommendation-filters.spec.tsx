import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecommendationFilters } from "./recommendation-filters";

describe("RecommendationFilters", () => {
  it("searches by city and country without repeating the selected city", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          city: "Хабаровск",
          country: "Россия",
          lat: 48.4813,
          lon: 135.0763,
          displayName: "Хабаровск, Хабаровский край, Россия",
          type: "city",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<RecommendationFilters params={{}} />);

    await user.type(screen.getByRole("textbox", { name: "Страна" }), "Россия");
    await user.type(
      screen.getByRole("textbox", { name: "Город" }),
      "Хабаровск",
    );

    const option = await screen.findByRole("button", {
      name: /Хабаровск.*Россия/,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/geo\/search\?q=.*&country=%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/,
      ),
      expect.any(Object),
    );
    expect(option.textContent?.match(/Хабаровск(?=,|$)/g)).toHaveLength(1);
    expect(within(option).getByText("Хабаровский край")).toBeInTheDocument();

    await user.click(option);

    expect(screen.getByRole("textbox", { name: "Страна" })).toHaveValue(
      "Россия",
    );
    expect(screen.getByRole("textbox", { name: "Город" })).toHaveValue(
      "Хабаровск",
    );
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
