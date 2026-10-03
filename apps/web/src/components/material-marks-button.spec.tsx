import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialMarksButton } from "./material-marks-button";

const onSaveStages = vi.fn();
const onSaveLineage = vi.fn();

afterEach(() => {
  onSaveStages.mockReset();
  onSaveLineage.mockReset();
});

/* VED-715: «объедини их в один — фильтры как на главной странице. Для
   админов, когда фильтры не определены, раскрывается полное окно с выбором
   этапа самоидентификации и духовной линии; участники видят зафиксированную
   админом индикацию и не имеют возможности редактировать». */
describe("MaterialMarksButton (VED-715)", () => {
  it("участнику — одна кнопка с оба фильтра в подписи, окно только показывает", async () => {
    render(
      <MaterialMarksButton
        stages={["yogi", "devotee"]}
        subjects={[{ title: "Пост", lineage: "iskcon" }]}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Самоидентификация: Йог, Преданный. Пост: ISKCON",
    });
    await userEvent.click(trigger);

    expect(screen.getByText("Йог, Преданный")).toBeDefined();
    expect(screen.getByText("ISKCON")).toBeDefined();
    // Ни «Сохранить», ни единого элемента ввода — редактировать нечего.
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Ступени самоидентификации" }),
    ).toBeNull();
    // VED-635: пояснения о фильтрах на главной убрали как лишнее.
    expect(
      screen.queryByRole("link", { name: "фильтрах материалов" }),
    ).toBeNull();
  });

  it("без разметки у участника — «Для всех» и «Для всех линий»", async () => {
    render(
      <MaterialMarksButton
        stages={[]}
        subjects={[{ title: "Материал", lineage: null }]}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Самоидентификация: для всех. Материал: Для всех линий",
      }),
    );
    expect(screen.getByText("Для всех")).toBeDefined();
    expect(screen.getByText("Для всех линий")).toBeDefined();
  });

  it("окно админа — оба выбора рядом, как фильтры на главной", async () => {
    onSaveStages.mockResolvedValue(undefined);
    onSaveLineage.mockResolvedValue(undefined);
    render(
      <MaterialMarksButton
        stages={[]}
        subjects={[{ title: "Пост", lineage: null }]}
        onSaveStages={onSaveStages}
        onSaveLineage={onSaveLineage}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Самоидентификация/ }));

    // Оба раздела раскрыты сразу: ступени и линия выбираются в одном окне.
    expect(
      screen.getByRole("group", { name: "Ступени самоидентификации" }),
    ).toBeDefined();
    expect(screen.getByRole("group", { name: "Духовная линия" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Для всех" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Без линии — для всех" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Преданный" }));
    await userEvent.click(screen.getByRole("button", { name: "ISKCON" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSaveStages).toHaveBeenCalledWith(["devotee"]);
    expect(onSaveLineage).toHaveBeenCalledWith("iskcon");
  });

  it("меняется только линия — ступени второй раз не пишутся", async () => {
    onSaveLineage.mockResolvedValue(undefined);
    render(
      <MaterialMarksButton
        stages={["yogi"]}
        subjects={[{ title: "Пост", lineage: null }]}
        onSaveStages={onSaveStages}
        onSaveLineage={onSaveLineage}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Самоидентификация/ }));
    await userEvent.click(screen.getByRole("button", { name: "ISKCON" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSaveLineage).toHaveBeenCalledWith("iskcon");
    expect(onSaveStages).not.toHaveBeenCalled();
  });

  it("ничего не меняли — «Сохранить» ничего не пишет", async () => {
    render(
      <MaterialMarksButton
        stages={["yogi"]}
        subjects={[{ title: "Пост", lineage: "iskcon" }]}
        onSaveStages={onSaveStages}
        onSaveLineage={onSaveLineage}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Самоидентификация/ }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSaveStages).not.toHaveBeenCalled();
    expect(onSaveLineage).not.toHaveBeenCalled();
  });

  it("ошибка сохранения видна в окне, окно остаётся открытым", async () => {
    onSaveStages.mockRejectedValue(new Error("403"));
    render(
      <MaterialMarksButton
        stages={[]}
        subjects={[{ title: "Пост", lineage: null }]}
        onSaveStages={onSaveStages}
        onSaveLineage={onSaveLineage}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Самоидентификация/ }));
    await userEvent.click(screen.getByRole("button", { name: "Йог" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Не удалось сохранить ступени",
    );
    expect(
      screen.getByRole("group", { name: "Ступени самоидентификации" }),
    ).toBeDefined();
  });

  it("участник и админ — автора в окне только показывают", async () => {
    const { rerender } = render(
      <MaterialMarksButton
        stages={[]}
        subjects={[
          { title: "Запись", lineage: null },
          { title: "Исполнитель", lineage: "iskcon" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Самоидентификация/ }));
    expect(screen.getByText("Исполнитель")).toBeDefined();

    rerender(
      <MaterialMarksButton
        stages={[]}
        subjects={[
          { title: "Запись", lineage: null },
          { title: "Исполнитель", lineage: "iskcon" },
        ]}
        onSaveStages={onSaveStages}
        onSaveLineage={onSaveLineage}
      />,
    );
    // Строку материала заменяет выбор линии; исполнитель — под ним.
    expect(screen.queryByText("Запись")).toBeNull();
    expect(screen.getByText("Исполнитель")).toBeDefined();
    expect(
      screen.getByRole("group", { name: "Духовная линия" }),
    ).toBeDefined();
  });

  /* VED-613: «менять цвет может только главная клавиша фильтров» —
     значок нейтральный, как соседи по ряду. */
  it("кнопка нейтральная, без цветной каёмки", () => {
    render(
      <MaterialMarksButton
        stages={["yogi"]}
        subjects={[{ title: "Пост", lineage: "iskcon" }]}
        onSaveStages={onSaveStages}
      />,
    );
    const trigger = screen.getByRole("button", { name: /^Самоидентификация/ });
    expect(trigger).toHaveClass("border-glass-brd");
    expect(trigger.className).not.toMatch(/(^| )border-(magenta|cyan)/);
  });
});
