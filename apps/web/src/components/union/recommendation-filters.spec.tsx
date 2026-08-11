import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecommendationFilters } from "./recommendation-filters";

describe("RecommendationFilters", () => {
  it("searches by city and fills the hidden country field from the selected result", async () => {
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

    const { container } = render(<RecommendationFilters params={{}} />);

    // Страна больше не вводится вручную — только город, страна подставляется
    // из выбранного результата подсказки и уходит скрытым полем формы.
    await user.type(
      screen.getByRole("textbox", { name: "Город" }),
      "Хабаровск",
    );

    const option = await screen.findByRole("button", {
      name: /Хабаровск.*Россия/,
    });
    expect(option.textContent?.match(/Хабаровск(?=,|$)/g)).toHaveLength(1);
    expect(within(option).getByText("Хабаровский край")).toBeInTheDocument();

    await user.click(option);

    expect(screen.getByRole("textbox", { name: "Город" })).toHaveValue(
      "Хабаровск",
    );
    expect(
      container.querySelector<HTMLInputElement>('input[name="country"]'),
    ).toHaveValue("Россия");
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("submits verifiedOnly only while the box is checked", async () => {
    const user = userEvent.setup();
    render(<RecommendationFilters params={{ verifiedOnly: "true" }} />);

    const checkbox = screen.getByRole("checkbox", {
      name: /подтверждённые администрацией/i,
    });
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAttribute("name", "verifiedOnly");
    expect(checkbox).toHaveAttribute("value", "true");

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});
