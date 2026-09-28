import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryAudienceButton } from "./entry-audience-button";

const refresh = vi.fn();
const setLibraryEntryAudienceStages = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/library-admin-api", () => ({
  setLibraryEntryAudienceStages: (...args: unknown[]) =>
    setLibraryEntryAudienceStages(...args),
}));

afterEach(() => {
  refresh.mockClear();
  setLibraryEntryAudienceStages.mockReset();
});

describe("EntryAudienceButton (VED-575)", () => {
  it("не видна без права", () => {
    const { container } = render(
      <EntryAudienceButton entryId="e-1" audienceStages={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("админу называет текущую разметку", () => {
    render(
      <EntryAudienceButton
        entryId="e-1"
        audienceStages={["yogi", "seeker"]}
        canSet
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Ступени самоидентификации: Ищущий, Йог",
      }),
    ).toBeDefined();
  });

  it("мультивыбор: отмеченные ступени уходят одним сохранением", async () => {
    setLibraryEntryAudienceStages.mockResolvedValue({
      id: "e-1",
      audienceStages: ["seeker", "devotee"],
    });
    const onChanged = vi.fn();
    render(
      <EntryAudienceButton
        entryId="e-1"
        audienceStages={["seeker"]}
        canSet
        onChanged={onChanged}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Ступени самоидентификации/ }),
    );
    expect(
      screen.getByRole("button", { name: "Ищущий", pressed: true }),
    ).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Преданный" }));
    expect(
      screen.getByRole("button", { name: "Преданный", pressed: true }),
    ).toBeDefined();
    // Отметка — только черновик: до «Сохранить» запроса нет.
    expect(setLibraryEntryAudienceStages).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(["seeker", "devotee"]),
    );
    expect(setLibraryEntryAudienceStages).toHaveBeenCalledWith("e-1", [
      "seeker",
      "devotee",
    ]);
    expect(refresh).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("group", {
        name: "Ступени самоидентификации материала",
      }),
    ).toBeNull();
  });

  it("«Для всех» снимает разметку; без onChanged страница перечитывается", async () => {
    setLibraryEntryAudienceStages.mockResolvedValue({
      id: "e-1",
      audienceStages: [],
    });
    render(
      <EntryAudienceButton entryId="e-1" audienceStages={["yogi"]} canSet />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Ступени самоидентификации/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Для всех" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setLibraryEntryAudienceStages).toHaveBeenCalledWith("e-1", []);
  });

  it("ошибка сохранения видна в меню, меню остаётся открытым", async () => {
    setLibraryEntryAudienceStages.mockRejectedValue(new Error("403"));
    render(<EntryAudienceButton entryId="e-1" audienceStages={[]} canSet />);

    await userEvent.click(
      screen.getByRole("button", { name: /Ступени самоидентификации/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Йог" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Не удалось сохранить ступени",
    );
  });
});
