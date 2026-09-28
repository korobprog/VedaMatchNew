import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LineageInfoButton } from "./lineage-info-button";
import { lineageInfoRows } from "@/lib/lineage-info";

/* VED-616: «кнопка с домиком должна быть для всех участников портала …
   они смогут увидеть к какой линии принадлежит тот или иной материал … и
   автор». */
describe("LineageInfoButton (VED-616)", () => {
  it("называет линию материала и автора прямо в имени кнопки", () => {
    render(
      <LineageInfoButton
        subjects={[
          { title: "Запись", lineage: null },
          {
            title: "Исполнитель",
            lineage: "narottama_parivara",
            emptyLabel: "Линия не указана",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Линия. Запись: Для всех линий. Исполнитель: Паривары — Нароттама-паривара",
      }),
    ).toBeDefined();
  });

  it("окно показывает линию и расшифровку по «?», без пояснения о фильтрах", async () => {
    render(
      <LineageInfoButton
        subjects={[{ title: "Материал", lineage: "iskcon" }]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Линия/ }));

    expect(screen.getByText("ISKCON")).toBeDefined();
    // VED-634: расшифровка скрыта, пока не нажат «?».
    const expansion = screen.getByText(
      "Международное общество сознания Кришны",
    );
    expect(expansion).not.toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Что такое ISKCON" }),
    );
    expect(expansion).toBeVisible();
    // VED-635: «Убери это пояснение, оно лишнее» — о фильтрах на главной.
    expect(
      screen.queryByRole("link", { name: "фильтрах материалов" }),
    ).toBeNull();
    expect(screen.queryByText(/выбирается в/)).toBeNull();
    // Участнику менять нечего.
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
  });
});

/* VED-632: «Для админов то же самое, только помимо отображения они могут
   менять и сохранять это отображение во всех материалах». */
describe("домик у администратора (VED-632)", () => {
  it("линию материала можно выбрать и сохранить", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <LineageInfoButton
        subjects={[
          { title: "Материал", lineage: null },
          { title: "Автор", lineage: "iskcon" },
        ]}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Линия/ }));

    const none = screen.getByRole("button", { name: "Без линии — для всех" });
    expect(none).toHaveAttribute("aria-pressed", "true");
    expect(none).toHaveFocus();
    // Автор — только показан.
    expect(screen.getByText("Автор")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "ISKCON" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSave).toHaveBeenCalledWith("iskcon");
  });

  it("«?» у пункта раскрывает расшифровку и ничего не выбирает (VED-634)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <LineageInfoButton
        subjects={[{ title: "Материал", lineage: null }]}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Линия/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Что такое ISKCON" }),
    );
    expect(
      screen.getByText("Международное общество сознания Кришны"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "ISKCON" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

/* VED-613, отбой: «Менять цвет может только главная клавиша фильтров» —
   домик нейтральный при любой линии материала. */
describe("вид домика (VED-613)", () => {
  it("без цветной каёмки — и с линией, и без", () => {
    const { rerender } = render(
      <LineageInfoButton
        subjects={[{ title: "Материал", lineage: "iskcon" }]}
      />,
    );
    const button = () => screen.getByRole("button", { name: /^Линия/ });
    expect(button()).toHaveClass("border-glass-brd");
    expect(button().className).not.toMatch(/(^| )border-(magenta|cyan)/);
    rerender(
      <LineageInfoButton subjects={[{ title: "Материал", lineage: null }]} />,
    );
    expect(button()).toHaveClass("border-glass-brd");
    expect(button().className).not.toMatch(/(^| )border-(magenta|cyan)/);
  });
});

describe("lineageInfoRows", () => {
  it("пустая линия — подпись по месту", () => {
    expect(
      lineageInfoRows([
        { title: "Автор", lineage: null, emptyLabel: "Линия не указана" },
      ]),
    ).toEqual([{ title: "Автор", value: "Линия не указана" }]);
  });
});
