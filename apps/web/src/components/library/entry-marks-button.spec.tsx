import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryMarksButton } from "./entry-marks-button";

const refresh = vi.fn();
const setLibraryEntryAudienceStages = vi.fn();
const setLibraryEntryLineage = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/library-admin-api", () => ({
  setLibraryEntryAudienceStages: (...args: unknown[]) =>
    setLibraryEntryAudienceStages(...args),
  setLibraryEntryLineage: (...args: unknown[]) =>
    setLibraryEntryLineage(...args),
}));

afterEach(() => {
  refresh.mockClear();
  setLibraryEntryAudienceStages.mockReset();
  setLibraryEntryLineage.mockReset();
});

/* VED-616: «Раздели данное окно на ДВЕ КОЛОНКИ. Во второй колонке справа
   продублируй … все духовные линии, организации. Кнопка с отпечатком
   пальца будет только для админов». */
describe("EntryMarksButton (VED-616)", () => {
  it("не видна без права", () => {
    const { container } = render(
      <EntryMarksButton entryId="e-1" audienceStages={[]} lineage={null} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("админу называет ступени и линию", () => {
    render(
      <EntryMarksButton
        entryId="e-1"
        audienceStages={["yogi", "seeker"]}
        lineage="iskcon"
        canSet
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Разметка. Ступени: Ищущий, Йог. Линия: ISKCON",
      }),
    ).toBeDefined();
  });

  it("две колонки: ступени слева, линии справа; сохраняется одним нажатием", async () => {
    setLibraryEntryAudienceStages.mockResolvedValue({
      id: "e-1",
      audienceStages: ["seeker", "devotee"],
    });
    setLibraryEntryLineage.mockResolvedValue({ id: "e-1", lineage: "ipbys" });
    const onChanged = vi.fn();
    render(
      <EntryMarksButton
        entryId="e-1"
        audienceStages={["seeker"]}
        lineage="iskcon"
        canSet
        onChanged={onChanged}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Разметка/ }));
    const stages = screen.getByRole("group", {
      name: "Ступени самоидентификации",
    });
    const lineages = screen.getByRole("group", { name: "Духовная линия" });
    expect(stages.parentElement).toBe(lineages.parentElement);
    expect(stages.parentElement?.className).toContain("grid-cols-2");

    await userEvent.click(
      within(stages).getByRole("button", { name: "Преданный" }),
    );
    await userEvent.click(
      within(lineages).getByRole("button", { name: "Гаудия-матх" }),
    );
    await userEvent.click(
      within(lineages).getByRole("button", { name: "IPBYS" }),
    );
    // Отметки — только черновик: до «Сохранить» запросов нет.
    expect(setLibraryEntryAudienceStages).not.toHaveBeenCalled();
    expect(setLibraryEntryLineage).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith({
        stages: ["seeker", "devotee"],
        lineage: "ipbys",
      }),
    );
    expect(setLibraryEntryAudienceStages).toHaveBeenCalledWith("e-1", [
      "seeker",
      "devotee",
    ]);
    expect(setLibraryEntryLineage).toHaveBeenCalledWith("e-1", "ipbys");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("меняется только линия — ступени не пишутся", async () => {
    setLibraryEntryLineage.mockResolvedValue({ id: "e-1", lineage: null });
    render(
      <EntryMarksButton
        entryId="e-1"
        audienceStages={["yogi"]}
        lineage="iskcon"
        canSet
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Разметка/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Без линии — для всех" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setLibraryEntryLineage).toHaveBeenCalledWith("e-1", null);
    expect(setLibraryEntryAudienceStages).not.toHaveBeenCalled();
  });

  it("«Для всех» снимает и ступени, и линию", async () => {
    setLibraryEntryAudienceStages.mockResolvedValue({
      id: "e-1",
      audienceStages: [],
    });
    setLibraryEntryLineage.mockResolvedValue({ id: "e-1", lineage: null });
    render(
      <EntryMarksButton
        entryId="e-1"
        audienceStages={["yogi"]}
        lineage="iskcon"
        canSet
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Разметка/ }));
    await userEvent.click(screen.getByRole("button", { name: "Для всех" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setLibraryEntryAudienceStages).toHaveBeenCalledWith("e-1", []);
    expect(setLibraryEntryLineage).toHaveBeenCalledWith("e-1", null);
  });

  it("ошибка сохранения видна в окне, окно остаётся открытым", async () => {
    setLibraryEntryAudienceStages.mockRejectedValue(new Error("403"));
    render(
      <EntryMarksButton
        entryId="e-1"
        audienceStages={[]}
        lineage={null}
        canSet
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Разметка/ }));
    await userEvent.click(screen.getByRole("button", { name: "Йог" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Не удалось сохранить разметку",
    );
  });
});
