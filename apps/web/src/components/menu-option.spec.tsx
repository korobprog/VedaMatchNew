import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MenuOptionLabel, menuOptionClass } from "./menu-option";

/* VED-596: «Сделай, чтобы когда выбираешь „Для всех“, этот выбор был виден
   внутри окна кнопки. Это же касается всех категорий». */
describe("выбор виден внутри меню (VED-596)", () => {
  it("выбранный пункт — с подложкой и галочкой, невыбранный — без", () => {
    expect(menuOptionClass(true)).toContain("bg-magenta/10");
    expect(menuOptionClass(false)).not.toContain("bg-magenta");
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

  /* VED-623: «Сделай это (убери розовую каёмку) для всех кнопок, где она
     появляется». */
  it("без розовой рамки у выбранного пункта (VED-623)", () => {
    expect(menuOptionClass(true)).not.toMatch(/ring-|border-magenta/);
  });
});
