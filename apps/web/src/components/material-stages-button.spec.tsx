import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MaterialStagesButton } from "./material-stages-button";

/* VED-632: «на всех материалах должно присутствовать две кнопки-значка —
   домик … и отпечаток пальца (участники) для отображения
   самоидентификации. Для админов то же самое, только помимо отображения они
   могут менять и сохранять». */
describe("MaterialStagesButton (VED-632)", () => {
  it("участнику — только показывает ступени, без «Сохранить»", async () => {
    render(<MaterialStagesButton stages={["yogi", "devotee"]} />);
    const trigger = screen.getByRole("button", {
      name: "Самоидентификация: Йог, Преданный",
    });
    await userEvent.click(trigger);
    expect(screen.getByText("Йог, Преданный")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    // Без пояснения о фильтрах на главной (VED-635).
    expect(
      screen.queryByRole("link", { name: "фильтрах материалов" }),
    ).toBeNull();
  });

  it("без ступеней — «Для всех»", async () => {
    render(<MaterialStagesButton stages={[]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Самоидентификация: для всех" }),
    );
    expect(screen.getByText("Для всех")).toBeDefined();
  });

  it("администратор отмечает ступени и сохраняет", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MaterialStagesButton stages={[]} onSave={onSave} />);
    await userEvent.click(
      screen.getByRole("button", { name: /^Самоидентификация/ }),
    );
    const forAll = screen.getByRole("button", { name: "Для всех" });
    expect(forAll).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Йог" }));
    expect(screen.getByRole("button", { name: "Йог" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(forAll).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave).toHaveBeenCalledWith(["yogi"]);
  });

  it("кнопка нейтральная, без каёмки (VED-613)", () => {
    render(<MaterialStagesButton stages={["yogi"]} onSave={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /^Самоидентификация/ });
    expect(trigger).toHaveClass("border-glass-brd");
    expect(trigger.className).not.toMatch(/(^| )border-(magenta|cyan)/);
  });
});
