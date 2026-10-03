import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryMarksButtons } from "./entry-marks-button";

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

/* VED-632: «для админов то же самое, только помимо отображения они могут
   менять и сохранять». VED-715: домик и отпечаток объединены в одну
   кнопку — окно фильтров как на главной. */
describe("EntryMarksButtons (VED-715)", () => {
  it("участнику — одна кнопка, оба фильтра только показывают", async () => {
    render(
      <EntryMarksButtons
        locale="ru"
        entryId="e-1"
        audienceStages={["yogi", "seeker"]}
        lineage="iskcon"
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Самоидентификация: Ищущий, Йог. Материал: ISKCON",
    });
    await userEvent.click(trigger);

    expect(screen.getByText("Ищущий, Йог")).toBeDefined();
    expect(screen.getByText("ISKCON")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("админ меняет ступени в том же окне — пишутся только ступени", async () => {
    setLibraryEntryAudienceStages.mockResolvedValue({
      id: "e-1",
      audienceStages: ["seeker", "devotee"],
    });
    const onChanged = vi.fn();
    render(
      <EntryMarksButtons
        locale="ru"
        entryId="e-1"
        audienceStages={["seeker"]}
        lineage="iskcon"
        canSet
        onChanged={onChanged}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Самоидентификация/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Преданный" }));
    // Отметки — только черновик: до «Сохранить» запросов нет.
    expect(setLibraryEntryAudienceStages).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith({
        stages: ["seeker", "devotee"],
        lineage: "iskcon",
      }),
    );
    expect(setLibraryEntryAudienceStages).toHaveBeenCalledWith("e-1", [
      "seeker",
      "devotee",
    ]);
    expect(setLibraryEntryLineage).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("админ меняет линию в том же окне — пишется только линия", async () => {
    setLibraryEntryLineage.mockResolvedValue({ id: "e-1", lineage: "ipbys" });
    render(
      <EntryMarksButtons
        locale="ru"
        entryId="e-1"
        audienceStages={["yogi"]}
        lineage="iskcon"
        canSet
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Самоидентификация/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Гаудия-матх" }));
    await userEvent.click(screen.getByRole("button", { name: "IPBYS" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setLibraryEntryLineage).toHaveBeenCalledWith("e-1", "ipbys");
    expect(setLibraryEntryAudienceStages).not.toHaveBeenCalled();
  });

  it("ошибка сохранения видна в окне, окно остаётся открытым", async () => {
    setLibraryEntryAudienceStages.mockRejectedValue(new Error("403"));
    render(
      <EntryMarksButtons
        locale="ru"
        entryId="e-1"
        audienceStages={[]}
        lineage={null}
        canSet
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^Самоидентификация/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Йог" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Не удалось сохранить ступени",
    );
  });
});
