import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  IntentionPicker,
  evenWeights,
  isEvenSplit,
} from "./intention-picker";

describe("evenWeights", () => {
  it("splits 100 exactly, remainder first", () => {
    expect(evenWeights(["family", "business", "friendship"])).toEqual({
      family: 34,
      business: 33,
      friendship: 33,
      service: 0,
    });
  });

  it("gives a single goal everything", () => {
    expect(evenWeights(["service"])).toEqual({
      family: 0,
      business: 0,
      friendship: 0,
      service: 100,
    });
  });
});

describe("isEvenSplit", () => {
  it("recognises an even split", () => {
    expect(isEvenSplit({ family: 50, business: 50, friendship: 0, service: 0 })).toBe(true);
  });

  it("rejects hand-tuned weights", () => {
    expect(isEvenSplit({ family: 50, business: 25, friendship: 25, service: 0 })).toBe(false);
    expect(isEvenSplit({ family: 40, business: 20, friendship: 20, service: 20 })).toBe(false);
  });
});

describe("IntentionPicker", () => {
  it("re-splits evenly when a goal is checked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionPicker
        weights={{ family: 100, business: 0, friendship: 0, service: 0 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Бизнес и проекты" }));

    expect(onChange).toHaveBeenCalledWith({
      family: 50,
      business: 50,
      friendship: 0,
      service: 0,
    });
  });

  it("refuses to uncheck the last goal", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionPicker
        weights={{ family: 100, business: 0, friendship: 0, service: 0 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Создание семьи" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/хотя бы одну цель/i)).toBeInTheDocument();
  });
});
