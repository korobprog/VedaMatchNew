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
    render(<IntentionChips counts={counts} selected={[]} showAll={false} />);

    // Пока режим выключен, числа у «всех» нет: counts.all посчитан по текущей
    // выдаче и обещал бы то, чего человек не увидит.
    expect(
      screen.getByRole("button", { name: "Показать всех" }),
    ).toBeInTheDocument();
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
      <IntentionChips counts={counts} selected={["family"]} showAll={false} />,
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
      <IntentionChips counts={counts} selected={["family", "service"]} showAll={false} />,
    );

    await user.click(screen.getByRole("button", { name: "Показать всех" }));

    expect(
      container.querySelectorAll('input[name="intentions"]:checked'),
    ).toHaveLength(0);
  });

  it("«Показать всех» уходит на сервер параметром, а не одним лишь сбросом", async () => {
    // Иначе кнопка снимала бы только цели, а история показов и пожелания из
    // анкеты продолжали бы прятать людей молча — та самая «Все · 4».
    const user = userEvent.setup();
    const { container } = render(
      <IntentionChips counts={counts} selected={["family"]} showAll={false} />,
    );

    expect(container.querySelector('input[name="showAll"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: "Показать всех" }));

    expect(
      container.querySelector<HTMLInputElement>('input[name="showAll"]')?.value,
    ).toBe("true");
  });

  it("во включённом режиме чип горит и знает своё число", () => {
    render(<IntentionChips counts={counts} selected={[]} showAll />);

    const chip = screen.getByRole("button", { name: "Все · 128" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("выбор конкретной цели гасит режим «все»", async () => {
    // «Все» и сужение по цели — противоположные намерения; оставить включёнными
    // оба значило бы показывать отсмотренных внутри выбранной цели.
    const user = userEvent.setup();
    const { container } = render(
      <IntentionChips counts={counts} selected={[]} showAll />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Бизнес и проекты · 30" }),
    );

    expect(container.querySelector('input[name="showAll"]')).toBeNull();
  });
});
