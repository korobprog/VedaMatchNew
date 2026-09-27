import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryLineageButton } from "./entry-lineage-button";

const refresh = vi.fn();
const setLibraryEntryLineage = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/library-admin-api", () => ({
  setLibraryEntryLineage: (...args: unknown[]) =>
    setLibraryEntryLineage(...args),
}));

afterEach(() => {
  refresh.mockClear();
  setLibraryEntryLineage.mockReset();
});

describe("EntryLineageButton", () => {
  it("не видна без права (участник, автор материала)", () => {
    const { container } = render(
      <EntryLineageButton entryId="entry-1" lineage="iskcon" />,
    );
    expect(container.innerHTML).toBe("");

    render(
      <EntryLineageButton
        entryId="entry-1"
        lineage="iskcon"
        canSetLineage={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /Линия/ })).toBeNull();
  });

  it("видна админу Образования и называет текущую линию", () => {
    render(
      <EntryLineageButton entryId="entry-1" lineage="iskcon" canSetLineage />,
    );

    const button = screen.getByRole("button", { name: "Линия: ISKCON" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("выбор в меню сохраняет линию через админский маршрут", async () => {
    setLibraryEntryLineage.mockResolvedValue({
      id: "entry-1",
      lineage: "nityananda_vamsha",
    });
    const onChanged = vi.fn();
    render(
      <EntryLineageButton
        entryId="entry-1"
        lineage="iskcon"
        canSetLineage
        onChanged={onChanged}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Линия: ISKCON" }),
    );
    expect(
      screen.getByRole("button", { name: "ISKCON", pressed: true }),
    ).toBeDefined();
    // ISKCON в меню один раз; паривары — внутри своей группы (VED-568).
    expect(screen.getAllByRole("button", { name: "ISKCON" })).toHaveLength(1);
    const parivaras = screen.getByRole("button", { name: "Паривары" });
    expect(parivaras.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(parivaras);
    expect(parivaras.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(
      screen.getByRole("button", { name: "Нитьянанда-вамша" }),
    );

    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledWith("nityananda_vamsha");
    });
    expect(setLibraryEntryLineage).toHaveBeenCalledWith(
      "entry-1",
      "nityananda_vamsha",
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Линия материала" })).toBeNull();
  });

  it("«без линии» уходит как null; без onChanged страница перечитывается", async () => {
    setLibraryEntryLineage.mockResolvedValue({ id: "entry-1", lineage: null });
    render(
      <EntryLineageButton entryId="entry-1" lineage="iskcon" canSetLineage />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Линия: ISKCON" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Без линии — для всех" }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setLibraryEntryLineage).toHaveBeenCalledWith("entry-1", null);
  });

  it("группа текущей линии раскрыта сразу, линия в ней нажата", async () => {
    render(
      <EntryLineageButton entryId="entry-1" lineage="ipbys" canSetLineage />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Линия: Гаудия-матх — IPBYS" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Гаудия-матх" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "IPBYS", pressed: true }),
    ).toBeDefined();
  });

  it("ошибка сохранения видна в меню, меню не закрывается", async () => {
    setLibraryEntryLineage.mockRejectedValue(new Error("403"));
    render(
      <EntryLineageButton entryId="entry-1" lineage={null} canSetLineage />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Линия: для всех линий" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Гаудия-матх" }));
    await userEvent.click(screen.getByRole("button", { name: "IPBYS" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Не удалось сохранить линию",
    );
    expect(
      screen.getByRole("group", { name: "Линия материала" }),
    ).toBeDefined();
  });
});
