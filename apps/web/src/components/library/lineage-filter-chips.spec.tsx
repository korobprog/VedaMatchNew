import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryLineageFilter } from "./lineage-filter-chips";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  usePathname: () => "/library",
}));

const apiFetch = vi.fn();
vi.mock("@/lib/http-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const devotee = { spiritualStage: "devotee" as const, lineage: "iskcon" as const };

describe("LibraryLineageFilter", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    apiFetch.mockReset().mockResolvedValue({ ok: true });
  });

  it("рисует «все линии» и кнопку на каждую линию, нажата применённая", () => {
    render(
      <LibraryLineageFilter locale="ru" applied="iskcon" preference={null} viewer={devotee} />,
    );
    const group = screen.getByRole("group", { name: "Духовная линия материалов" });
    const buttons = group.querySelectorAll("button");
    expect(buttons).toHaveLength(11);
    expect(screen.getByRole("button", { name: "ISKCON" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Все линии" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("чужая линия сохраняется в настройку Образования и обновляет выдачу", async () => {
    render(
      <LibraryLineageFilter locale="ru" applied="iskcon" preference={null} viewer={devotee} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Чайтанья Гаудия Матх" }));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/library\/me\/preferences$/);
    expect(JSON.parse(init.body)).toEqual({ lineage: "sri_chaitanya_gaudiya_math" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/library", { scroll: false });
  });

  it("нажатая кнопка — ничего не делает", async () => {
    render(
      <LibraryLineageFilter locale="ru" applied="iskcon" preference={null} viewer={devotee} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "ISKCON" }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("ошибка сохранения — сообщение и прежняя кнопка нажата", async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 500 });
    render(
      <LibraryLineageFilter locale="ru" applied="iskcon" preference={null} viewer={devotee} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "IPBYS" }));
    expect(
      await screen.findByText("Не удалось переключить линию, попробуйте ещё раз"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ISKCON" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
