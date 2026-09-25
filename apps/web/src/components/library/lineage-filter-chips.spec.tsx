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


describe("LibraryLineageFilter (VED-449)", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    apiFetch.mockReset().mockResolvedValue({ ok: true });
  });

  function open(applied: "iskcon" | "sri_chaitanya_saraswat_math" | null = "iskcon") {
    render(
      <LibraryLineageFilter locale="ru" applied={applied} preference={null} />,
    );
    return userEvent.click(screen.getByRole("button", { name: "Фильтры" }));
  }

  it("одна кнопка «Фильтры», меню закрыто", () => {
    render(
      <LibraryLineageFilter locale="ru" applied="iskcon" preference={null} />,
    );
    expect(screen.getByRole("button", { name: "Фильтры" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: "ИСККОН" })).not.toBeInTheDocument();
  });

  it("в меню четыре позиции: Всё, ИСККОН, Гаудия-матх, Паривары", async () => {
    await open();
    const menu = screen.getByRole("group", { name: "Духовная линия материалов" });
    const top = Array.from(menu.children).map((node) =>
      (node.tagName === "BUTTON" ? node : node.querySelector("button"))?.textContent,
    );
    expect(top).toEqual(["Всё", "ИСККОН", "Гаудия-матх", "Паривары"]);
    expect(screen.getByRole("button", { name: "ИСККОН" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("матхи — внутри «Гаудия-матх», выбор сохраняет настройку", async () => {
    await open();
    expect(
      screen.queryByRole("button", { name: "Шри Чайтанья Сарасват Матх" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Гаудия-матх" }));
    await userEvent.click(screen.getByRole("button", { name: "Шри Чайтанья Матх" }));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/library\/me\/preferences$/);
    expect(JSON.parse(init.body)).toEqual({ lineage: "sri_chaitanya_gaudiya_math" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/library", { scroll: false });
    // Выбор закрывает меню.
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("группа свёрнута и с выбранной линией внутри — выбор виден в шапке (VED-483)", async () => {
    await open("sri_chaitanya_saraswat_math");
    const group = screen.getByRole("button", { name: /^Гаудия-матх/ });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(group).toHaveTextContent("Шри Чайтанья Сарасват Матх");
    await userEvent.click(group);
    expect(
      screen.getByRole("button", { name: "Шри Чайтанья Сарасват Матх" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("выбранная позиция — ничего не делает", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "ИСККОН" }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Escape закрывает меню", async () => {
    await open();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("ошибка сохранения — сообщение, настройка прежняя", async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 500 });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Гаудия-матх" }));
    await userEvent.click(screen.getByRole("button", { name: "IPBYS" }));
    expect(
      await screen.findByText("Не удалось переключить линию, попробуйте ещё раз"),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
