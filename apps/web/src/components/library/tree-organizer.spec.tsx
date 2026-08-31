import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import { LibraryTreeOrganizer } from "./tree-organizer";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http-client", () => ({ apiFetch }));

function node(
  id: string,
  titleRu: string,
  depth: number,
  parentId: string | null,
  children: LibraryCategoryTreeNode[] = [],
): LibraryCategoryTreeNode {
  return {
    id,
    parentId,
    slug: id,
    titleRu,
    titleEn: titleRu,
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth,
    entriesCount: 0,
    subtreeEntriesCount: 0,
    childrenCount: children.length,
    createdAt: "2026-08-29T00:00:00.000Z",
    canEdit: true,
    canMove: true,
    canDelete: true,
    children,
  };
}

/**
 *   Философия
 *     Прабхупада
 *       Лекции
 *   Музыка
 */
function tree(): LibraryCategoryTreeNode[] {
  return [
    node("philosophy", "Философия", 0, null, [
      node("prabhupada", "Прабхупада", 1, "philosophy", [
        node("lectures", "Лекции", 2, "prabhupada"),
      ]),
    ]),
    node("music", "Музыка", 0, null),
  ];
}

function ok(body: unknown = tree()) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

/** Дерево, каким его вернул бы сервер после подъёма «Музыки» наверх. */
function movedTree(): LibraryCategoryTreeNode[] {
  const [philosophy, music] = tree();
  return [music, philosophy];
}

function setup() {
  return render(<LibraryTreeOrganizer locale="ru" initialTree={tree()} />);
}

/** Последнее тело запроса `move` — что именно ушло на сервер. */
function lastMove() {
  const call = apiFetch.mock.calls.at(-1);
  return {
    url: call?.[0] as string,
    body: JSON.parse((call?.[1] as { body: string }).body) as {
      parentId: string | null;
      beforeId: string | null;
    },
  };
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue(ok());
  refresh.mockReset();
});

describe("LibraryTreeOrganizer — раскладка", () => {
  it("рисует дерево с уровнями", () => {
    setup();
    const items = screen.getAllByRole("treeitem");

    expect(
      items.map((item) => [
        within(item).getByText(/Философия|Прабхупада|Лекции|Музыка/).textContent,
        item.getAttribute("aria-level"),
      ]),
    ).toEqual([
      ["Философия", "1"],
      ["Прабхупада", "2"],
      ["Лекции", "3"],
      ["Музыка", "1"],
    ]);
  });

  it("сворачивает ветку, не трогая сервер", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getAllByRole("button", { name: "Свернуть" })[0]);

    expect(screen.queryByText("Прабхупада")).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("LibraryTreeOrganizer — шторка «Переместить в…»", () => {
  it("не даёт выбрать собственное поддерево", async () => {
    const user = userEvent.setup();
    setup();

    // Тащим «Прабхупаду»: у неё есть и запрещённое поддерево, и разрешённая
    // цель — на одном узле видно оба правила сразу.
    await user.click(
      within(screen.getAllByRole("treeitem")[1]).getByRole("button", {
        name: "Переместить в…",
      }),
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Лекции" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Музыка" })).toBeEnabled();
  });

  it("высокое поддерево закрывает даже пустую цель", async () => {
    const user = userEvent.setup();
    setup();

    // «Философия» несёт два уровня под собой, поэтому «Музыка» ей не
    // родитель, хотя сама по себе пуста: нижний уровень стал бы четвёртым.
    await user.click(
      within(screen.getAllByRole("treeitem")[0]).getByRole("button", {
        name: "Переместить в…",
      }),
    );

    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Музыка" }),
    ).toBeDisabled();
  });

  it("закрывает слишком глубокую цель", async () => {
    const user = userEvent.setup();
    setup();

    // «Музыка» — лист, но внутрь «Лекций» (уровень 2) не влезает и он.
    await user.click(
      within(screen.getAllByRole("treeitem")[3]).getByRole("button", {
        name: "Переместить в…",
      }),
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Лекции" })).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Прабхупада" }),
    ).toBeEnabled();
  });

  it("выбор цели уходит на сервер", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(
      within(screen.getAllByRole("treeitem")[3]).getByRole("button", {
        name: "Переместить в…",
      }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Прабхупада",
      }),
    );

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(lastMove().url).toContain("/library/categories/music/move");
    expect(lastMove().body).toEqual({ parentId: "prabhupada", beforeId: null });
  });

  it("Escape закрывает шторку", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(
      within(screen.getAllByRole("treeitem")[3]).getByRole("button", {
        name: "Переместить в…",
      }),
    );
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("LibraryTreeOrganizer — клавиатура", () => {
  it("Ctrl+↑ поднимает среди соседей", async () => {
    const user = userEvent.setup();
    setup();

    screen.getAllByRole("treeitem")[3].focus();
    await user.keyboard("{Control>}{ArrowUp}{/Control}");

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(lastMove().body).toEqual({
      parentId: null,
      beforeId: "philosophy",
    });
  });

  it("Ctrl+→ вкладывает в соседа сверху", async () => {
    const user = userEvent.setup();
    setup();

    screen.getAllByRole("treeitem")[3].focus();
    await user.keyboard("{Control>}{ArrowRight}{/Control}");

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(lastMove().body).toEqual({
      parentId: "philosophy",
      beforeId: null,
    });
  });

  it("Ctrl+← выносит на уровень родителя", async () => {
    const user = userEvent.setup();
    setup();

    screen.getAllByRole("treeitem")[2].focus();
    await user.keyboard("{Control>}{ArrowLeft}{/Control}");

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(lastMove().body).toEqual({ parentId: "philosophy", beforeId: null });
  });

  it("без Ctrl стрелки на сервер не ходят — это навигация", async () => {
    const user = userEvent.setup();
    setup();

    screen.getAllByRole("treeitem")[3].focus();
    await user.keyboard("{ArrowUp}{ArrowLeft}");

    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("LibraryTreeOrganizer — отмена и ошибки", () => {
  it("«Отменить» возвращает рубрику запросом, а не только на экране", async () => {
    const user = userEvent.setup();
    setup();

    // Сервер обязан вернуть переехавшее дерево: на неизменённом «Отменить»
    // законно оказалась бы пустым ходом и запроса не сделала.
    apiFetch.mockResolvedValueOnce(ok(movedTree()));
    screen.getAllByRole("treeitem")[3].focus();
    await user.keyboard("{Control>}{ArrowUp}{/Control}");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByRole("button", { name: "Отменить" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    // Была последней среди корней — туда и возвращаем.
    expect(lastMove().body).toEqual({ parentId: null, beforeId: null });
  });

  it("отказ сервера объясняется словами и дерево не меняется", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "max_depth_exceeded" }),
    });
    setup();

    screen.getAllByRole("treeitem")[3].focus();
    await user.keyboard("{Control>}{ArrowRight}{/Control}");

    expect(
      await screen.findByText("Глубже трёх уровней вкладывать нельзя"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("treeitem").map((item) => item.getAttribute("aria-level")))
      .toEqual(["1", "2", "3", "1"]);
  });

  it("упавшая сеть тоже не оставляет дерево переехавшим", async () => {
    const user = userEvent.setup();
    apiFetch.mockRejectedValue(new Error("offline"));
    setup();

    screen.getAllByRole("treeitem")[3].focus();
    await user.keyboard("{Control>}{ArrowUp}{/Control}");

    expect(
      await screen.findByText("Не удалось переместить рубрику"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("treeitem").map((item) =>
        item.textContent?.includes("Музыка"),
      ),
    ).toEqual([false, false, false, true]);
  });
});

describe("LibraryTreeOrganizer — удаление", () => {
  it("одного нажатия мало: сначала вопрос, потом запрос", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(
      within(screen.getAllByRole("treeitem")[3]).getByRole("button", {
        name: "Удалить рубрику: Музыка",
      }),
    );

    expect(apiFetch).not.toHaveBeenCalled();
    expect(
      screen.getByText("Удалить рубрику? Отменить нельзя."),
    ).toBeInTheDocument();
  });

  it("подтверждение уносит рубрику из дерева", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(ok({ ok: true }));
    setup();

    await user.click(
      within(screen.getAllByRole("treeitem")[3]).getByRole("button", {
        name: "Удалить рубрику: Музыка",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Да, удалить" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/library/categories/music");
    expect(init.method).toBe("DELETE");

    expect(await screen.findByText("Рубрика удалена")).toBeInTheDocument();
    expect(screen.getAllByRole("treeitem")).toHaveLength(3);
  });

  it("«Отмена» не трогает ни сервер, ни дерево", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(
      within(screen.getAllByRole("treeitem")[3]).getByRole("button", {
        name: "Удалить рубрику: Музыка",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.getAllByRole("treeitem")).toHaveLength(4);
  });

  it("непустую рубрику сервер не отдаёт, и это объясняется словами", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "category_not_empty" }),
    });
    setup();

    await user.click(
      within(screen.getAllByRole("treeitem")[3]).getByRole("button", {
        name: "Удалить рубрику: Музыка",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Да, удалить" }));

    expect(
      await screen.findByText(
        "В рубрике ещё есть материалы — сначала перенесите или удалите их",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("treeitem")).toHaveLength(4);
  });

  it("без права удаления кнопки нет", () => {
    const readOnly = tree().map((root) => ({ ...root, canDelete: false }));
    render(<LibraryTreeOrganizer locale="ru" initialTree={readOnly} />);

    expect(
      screen.queryByRole("button", { name: "Удалить рубрику: Музыка" }),
    ).not.toBeInTheDocument();
  });
});
