import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { IntentionChips } from "./intention-chips";

const counts = {
  all: 128,
  family: 64,
  business: 30,
  friendship: 48,
  service: 22,
};

describe("IntentionChips", () => {
  it("shows a count next to every goal", () => {
    render(<IntentionChips counts={counts} selected={[]} />);

    expect(screen.getByRole("button", { name: "Все · 128" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Создание семьи · 64" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Совместное служение · 22" }),
    ).toBeInTheDocument();
  });

  it("submits every checked goal under the same name", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <IntentionChips counts={counts} selected={["family"]} />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Бизнес и проекты · 30" }),
    );

    const checked = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        'input[name="intentions"]:checked',
      ),
    ).map((input) => input.value);
    expect(checked).toEqual(["family", "business"]);
  });

  it("clears the goals when «Все» is pressed", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <IntentionChips counts={counts} selected={["family", "service"]} />,
    );

    await user.click(screen.getByRole("button", { name: "Все · 128" }));

    expect(
      container.querySelectorAll('input[name="intentions"]:checked'),
    ).toHaveLength(0);
  });
});
