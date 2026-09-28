import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialFiltersButton } from "./material-filters-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/http-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function respond(materialFilters: unknown) {
  apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ materialFilters }),
  });
}

/* VED-617: «КНОПКА-значок ФИЛЬТРЫ МАТЕРИАЛОВ … два раздела: по
   самоидентификации, по духовной линии … выбрать несколько вариантов, хоть
   все». */
describe("MaterialFiltersButton (VED-617)", () => {
  beforeEach(() => {
    refresh.mockReset();
    apiFetch.mockReset();
  });

  it("по анкете: отмечена своя ступень и своя линия", async () => {
    render(
      <MaterialFiltersButton
        stage="devotee"
        initial={{ stages: ["devotee"], lineages: ["iskcon"], custom: false }}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Фильтры материалов: ступени — Преданный; линии — ISKCON",
    });
    await userEvent.click(trigger);

    const stages = screen.getByRole("group", { name: "По самоидентификации" });
    expect(
      within(stages).getByRole("checkbox", { name: /Преданный/ }),
    ).toBeChecked();
    expect(
      within(stages).getByRole("checkbox", { name: "Все ступени" }),
    ).not.toBeChecked();
    const lineages = screen.getByRole("group", { name: "По духовной линии" });
    expect(
      within(lineages).getByRole("checkbox", { name: "ISKCON" }),
    ).toBeChecked();
    // «По анкете» — только когда фильтры меняли руками.
    expect(screen.queryByRole("button", { name: "По анкете" })).toBeNull();
  });

  it("несколько ступеней и линий уходят одним сохранением", async () => {
    respond({
      stages: ["seeker", "yogi"],
      lineages: ["iskcon", "ipbys"],
      custom: true,
    });
    render(
      <MaterialFiltersButton
        stage="yogi"
        initial={{ stages: ["yogi"], lineages: [], custom: false }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Фильтры материалов/ }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Ищущий" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "ISKCON" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "IPBYS" }));
    expect(apiFetch).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toMatch(/\/profile$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({
      materialFilters: {
        stages: ["seeker", "yogi"],
        lineages: ["iskcon", "ipbys"],
      },
    });
    expect(
      screen.getByRole("button", {
        name: "Фильтры материалов: ступени — Ищущий, Йог; линии — ISKCON, IPBYS",
      }),
    ).toBeDefined();
  });

  it("«Все» снимает раздел, группа отмечается целиком", async () => {
    respond({ stages: [], lineages: [], custom: true });
    render(
      <MaterialFiltersButton
        stage="seeker"
        initial={{ stages: ["seeker"], lineages: [], custom: false }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Фильтры материалов/ }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Все ступени" }),
    );
    expect(screen.getByRole("checkbox", { name: /Ищущий/ })).not.toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: "Паривары" }));
    expect(
      screen.getByRole("checkbox", { name: "Адвайта-вамша" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Все линии" }),
    ).not.toBeChecked();
  });

  it("«По анкете» сбрасывает ручной выбор", async () => {
    respond({ stages: ["yogi"], lineages: [], custom: false });
    render(
      <MaterialFiltersButton
        stage="yogi"
        initial={{ stages: [], lineages: [], custom: true }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Фильтры материалов/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "По анкете" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
      materialFilters: null,
    });
  });

  it("ошибка сохранения видна в окне", async () => {
    apiFetch.mockResolvedValue({ ok: false, text: async () => "500" });
    render(
      <MaterialFiltersButton
        stage={null}
        initial={{ stages: [], lineages: [], custom: false }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Фильтры материалов/ }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Йог" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Не удалось сохранить фильтры",
    );
  });
});
