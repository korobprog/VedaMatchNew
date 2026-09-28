import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AudienceStagesMenuButton } from "./audience-stages-menu-button";
import { LineageMenuButton } from "./lineage-menu-button";
import { MenuOptionLabel, menuOptionClass } from "./menu-option";

/* VED-596: «Сделай, чтобы когда выбираешь „Для всех“, этот выбор был виден
   внутри окна кнопки. Это же касается всех категорий». */
describe("выбор виден внутри меню (VED-596)", () => {
  it("выбранный пункт — с рамкой и галочкой, невыбранный — без", () => {
    expect(menuOptionClass(true)).toContain("ring-magenta");
    expect(menuOptionClass(false)).not.toContain("ring-");
    const { container, rerender } = render(
      <button type="button">
        <MenuOptionLabel pressed>Все</MenuOptionLabel>
      </button>,
    );
    expect(container.querySelector("svg")).not.toBeNull();
    rerender(
      <button type="button">
        <MenuOptionLabel pressed={false}>Все</MenuOptionLabel>
      </button>,
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("«Линия»: без линии отмечено «Без линии — для всех»", async () => {
    render(<LineageMenuButton value={null} onSelect={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Линия: для всех линий" }),
    );
    const none = screen.getByRole("button", { name: "Без линии — для всех" });
    expect(none).toHaveAttribute("aria-pressed", "true");
    expect(none.querySelector("svg")).not.toBeNull();
    expect(none).toHaveFocus();
    expect(screen.getByRole("button", { name: "ISKCON" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("«Ступени»: без разметки отмечено «Для всех»", async () => {
    render(<AudienceStagesMenuButton value={[]} onSave={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Ступени самоидентификации/ }),
    );
    const forAll = screen.getByRole("button", { name: "Для всех" });
    expect(forAll).toHaveAttribute("aria-pressed", "true");
    expect(forAll.querySelector("svg")).not.toBeNull();
  });

  it("«Ступени»: отмеченная ступень снимает отметку с «Для всех»", async () => {
    render(<AudienceStagesMenuButton value={[]} onSave={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Ступени самоидентификации/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Йог" }));
    expect(screen.getByRole("button", { name: "Йог" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Для всех" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
