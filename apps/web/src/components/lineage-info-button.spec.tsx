import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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

  it("окно показывает линию с расшифровкой и ведёт к фильтрам", async () => {
    render(
      <LineageInfoButton
        subjects={[{ title: "Материал", lineage: "iskcon" }]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Линия/ }));

    expect(screen.getByText("ISKCON")).toBeDefined();
    expect(
      screen.getByText("Международное общество сознания Кришны"),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "фильтрах материалов" }),
    ).toHaveAttribute("href", "/#material-filters");
  });
});

/* VED-613: каёмка домика — светло-малиновая у конкретной линии, зелёная —
   «для всех линий». */
describe("каёмка домика (VED-613)", () => {
  it("линия материала есть — малиновая, нет — зелёная", () => {
    const { rerender } = render(
      <LineageInfoButton
        subjects={[{ title: "Материал", lineage: "iskcon" }]}
      />,
    );
    expect(screen.getByRole("button", { name: /^Линия/ })).toHaveClass(
      "border-magenta/50",
    );
    rerender(
      <LineageInfoButton subjects={[{ title: "Материал", lineage: null }]} />,
    );
    expect(screen.getByRole("button", { name: /^Линия/ })).toHaveClass(
      "border-cyan/60",
    );
  });
});

describe("lineageInfoRows", () => {
  it("пустая линия — подпись по месту", () => {
    expect(
      lineageInfoRows([
        { title: "Автор", lineage: null, emptyLabel: "Линия не указана" },
      ]),
    ).toEqual([{ title: "Автор", value: "Линия не указана", hint: null }]);
  });
});
