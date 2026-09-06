import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickPanel } from "./quick-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const STORAGE_KEY = "vedamatch:quick-panel";

function stubFetch(overrides: Record<string, unknown> = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("/billing/donation"))
      return Promise.resolve({
        ok: true,
        json: async () => ({ enabled: false, requisites: [] }),
      });
    if (String(url).includes("/rewards/me"))
      return Promise.resolve({
        ok: true,
        json: async () => ({ link: "https://vedamatch.ru/?ref=abc" }),
      });
    return Promise.resolve({ ok: true, json: async () => overrides });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openPanel() {
  const user = userEvent.setup();
  render(<QuickPanel />);
  await user.click(screen.getByRole("button", { name: "Горячие кнопки" }));
  return user;
}

describe("QuickPanel", () => {
  it("закрыта, пока её не открыли: панель не должна занимать экран", () => {
    render(<QuickPanel />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("показывает набор по умолчанию", async () => {
    await openPanel();

    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    expect(within(panel).getByRole("link", { name: /Афоризм/ })).toHaveAttribute(
      "href",
      "/motivation?order=random",
    );
    // Календарь — кнопка, а не ссылка: календарей два, и плитка открывает
    // выбор между афишей портала и вайшнавским календарём.
    expect(
      within(panel).getByRole("button", { name: /Календарь/ }),
    ).toBeInTheDocument();
  });

  it("календарь предлагает афишу портала и вайшнавский календарь", async () => {
    await openPanel();
    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    await userEvent.click(
      within(panel).getByRole("button", { name: /Календарь/ }),
    );

    expect(
      within(panel).getByRole("link", { name: "Афиша портала" }),
    ).toHaveAttribute("href", "/notices/events");
    const external = within(panel).getByRole("link", {
      name: /Вайшнавский календарь/,
    });
    expect(external).toHaveAttribute("href", "https://vcalendar.ru");
    // Без `noopener` открытая вкладка получает доступ к нашей через
    // `window.opener` — на внешних ссылках это обязательно.
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("помнит настроенный набор между заходами", async () => {
    window.localStorage.setItem(STORAGE_KEY, '["info"]');
    await openPanel();

    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    expect(within(panel).getByRole("button", { name: /Что нужно знать/ })).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: /Календарь/ })).not.toBeInTheDocument();
  });

  it("мусор в хранилище не ломает панель", async () => {
    window.localStorage.setItem(STORAGE_KEY, "не json");
    await openPanel();

    expect(screen.getByRole("link", { name: /Афоризм/ })).toBeInTheDocument();
  });

  it("включает кнопку в настройках и сохраняет выбор", async () => {
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(screen.getByRole("switch", { name: /Калькулятор/ }));

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)!),
    ).toContain("calculator");
  });

  it("выключенная кнопка уходит из панели", async () => {
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(screen.getByRole("switch", { name: /Календарь/ }));
    await user.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.queryByRole("link", { name: /Календарь/ })).not.toBeInTheDocument();
  });

  it("переставляет кнопки стрелками", async () => {
    window.localStorage.setItem(STORAGE_KEY, '["calendar","aphorism"]');
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(screen.getByRole("button", { name: "Выше: Афоризм" }));

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([
      "aphorism",
      "calendar",
    ]);
  });

  it("пустая панель говорит, что делать", async () => {
    window.localStorage.setItem(STORAGE_KEY, "[]");
    await openPanel();

    expect(screen.getByText(/Панель пуста/)).toBeInTheDocument();
  });

  it("считает в калькуляторе, не уводя со страницы", async () => {
    window.localStorage.setItem(STORAGE_KEY, '["calculator"]');
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: /Калькулятор/ }));
    await user.click(screen.getByRole("button", { name: "7" }));
    await user.click(screen.getByRole("button", { name: "×" }));
    await user.click(screen.getByRole("button", { name: "6" }));
    await user.click(screen.getByRole("button", { name: "Посчитать" }));

    expect(screen.getByLabelText("Результат")).toHaveTextContent("42");
  });

  it("копирует ссылку-приглашение в буфер", async () => {
    window.localStorage.setItem(STORAGE_KEY, '["invite"]');
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: /Пригласить/ }));

    // Читаем буфер обратно, а не подменяем `writeText`: `userEvent.setup()`
    // ставит свою реализацию буфера, и подменённая ей проигрывает.
    expect(await screen.findByText("Скопировано")).toBeInTheDocument();
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(
        "https://vedamatch.ru/?ref=abc",
      ),
    );
  });

  it("выключенные пожертвования не рисуют кнопку доната", async () => {
    window.localStorage.setItem(STORAGE_KEY, '["donate"]');
    await openPanel();

    // Так же, как везде на портале: реквизитов нет — кнопки нет.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Поддержать/ })).not.toBeInTheDocument(),
    );
  });
});
