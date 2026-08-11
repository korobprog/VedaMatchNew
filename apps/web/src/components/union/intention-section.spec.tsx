import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IntentionSection } from "./intention-section";

describe("IntentionSection", () => {
  it("shows checkboxes for an even split", () => {
    render(
      <IntentionSection
        weights={{ family: 50, business: 50, friendship: 0, service: 0 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Создание семьи" })).toBeChecked();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("opens hand-tuned weights in slider mode so they are not flattened", () => {
    render(
      <IntentionSection
        weights={{ family: 50, business: 25, friendship: 25, service: 0 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("slider")).toHaveLength(4);
    expect(
      screen.getByRole("checkbox", { name: /тонкая настройка/i }),
    ).toBeChecked();
  });

  it("re-splits evenly when fine tuning is switched off", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionSection
        weights={{ family: 50, business: 25, friendship: 25, service: 0 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /тонкая настройка/i }));

    expect(onChange).toHaveBeenCalledWith({
      family: 34,
      business: 33,
      friendship: 33,
      service: 0,
    });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("предлагает искать противоположный пол, когда цель «семья» отмечена", () => {
    render(
      <IntentionSection
        weights={{ family: 100, business: 0, friendship: 0, service: 0 }}
        onChange={vi.fn()}
        viewerGender="female"
        seeksGender="male"
        onSeeksGenderChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "Искать только мужчин" }),
    ).toBeChecked();
  });

  it("не показывает выбор пола без цели «Создание семьи»", () => {
    render(
      <IntentionSection
        weights={{ family: 0, business: 100, friendship: 0, service: 0 }}
        onChange={vi.fn()}
        viewerGender="female"
        seeksGender={null}
        onSeeksGenderChange={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Искать только/)).not.toBeInTheDocument();
  });

  it("подставляет противоположный пол, как только цель отмечена", async () => {
    const onSeeksGenderChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionSection
        weights={{ family: 0, business: 100, friendship: 0, service: 0 }}
        onChange={vi.fn()}
        viewerGender="male"
        seeksGender={null}
        onSeeksGenderChange={onSeeksGenderChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Создание семьи" }));

    expect(onSeeksGenderChange).toHaveBeenCalledWith("female");
  });

  it("снимает выбор пола вместе с целью", async () => {
    const onSeeksGenderChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionSection
        weights={{ family: 50, business: 50, friendship: 0, service: 0 }}
        onChange={vi.fn()}
        viewerGender="male"
        seeksGender="female"
        onSeeksGenderChange={onSeeksGenderChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Создание семьи" }));

    expect(onSeeksGenderChange).toHaveBeenCalledWith(null);
  });

  it("даёт выбрать пол вручную, когда в аккаунте он не указан", async () => {
    const onSeeksGenderChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionSection
        weights={{ family: 100, business: 0, friendship: 0, service: 0 }}
        onChange={vi.fn()}
        viewerGender={null}
        seeksGender={null}
        onSeeksGenderChange={onSeeksGenderChange}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Кого искать/ }),
      "male",
    );

    expect(onSeeksGenderChange).toHaveBeenCalledWith("male");
  });
});
