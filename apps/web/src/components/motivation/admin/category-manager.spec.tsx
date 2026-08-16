import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationCategoryDto } from "@vedamatch/shared";
import { CategoryManager } from "./category-manager";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const root: MotivationCategoryDto = {
  id: "cat-1",
  slug: "smirenie",
  title: "Смирение",
  sortOrder: 0,
  isDefault: true,
  parentId: null,
  postCount: 4,
};
const child: MotivationCategoryDto = {
  id: "cat-2",
  slug: "utro",
  title: "Утренняя практика",
  sortOrder: 10,
  isDefault: false,
  parentId: "cat-1",
  postCount: 0,
};

function okFetch() {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined };
}

describe("CategoryManager", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("creates a top-level category", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<CategoryManager categories={[]} />);
    await user.type(
      screen.getByLabelText("Название категории, например: Смирение"),
      "Вера",
    );
    await user.click(screen.getByRole("button", { name: "Добавить" }));

    expect(lastCall(fetchMock)).toMatchObject({
      method: "POST",
      body: { title: "Вера", parentId: null },
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("creates a subcategory under the chosen parent", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<CategoryManager categories={[root]} />);
    await user.click(screen.getByRole("button", { name: "+ Подкатегория" }));
    await user.type(
      screen.getByLabelText("Подкатегория в «Смирение»"),
      "Утренняя практика",
    );
    await user.click(screen.getAllByRole("button", { name: "Добавить" }).at(-1)!);

    expect(lastCall(fetchMock)).toMatchObject({
      body: { title: "Утренняя практика", parentId: "cat-1" },
    });
  });

  it("hides destructive actions on the default category", () => {
    render(<CategoryManager categories={[root, child]} />);

    const defaultRow = screen.getByText("Смирение").closest("li")!;
    expect(within(defaultRow).queryByRole("button", { name: "Удалить" })).toBeNull();
    expect(
      within(defaultRow).queryByRole("button", { name: "Сделать основной" }),
    ).toBeNull();
  });

  it("promotes another category to default", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<CategoryManager categories={[root, child]} />);
    await user.click(screen.getByRole("button", { name: "Сделать основной" }));

    expect(lastCall(fetchMock)).toMatchObject({
      method: "PATCH",
      body: { isDefault: true },
    });
    expect(lastCall(fetchMock).url).toContain("/admin/motivation/categories/cat-2");
  });

  it("renames a category", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<CategoryManager categories={[root, child]} />);
    await user.click(
      screen.getAllByRole("button", { name: "Переименовать" }).at(-1)!,
    );
    const input = screen.getByLabelText("Название категории «Утренняя практика»");
    await user.clear(input);
    await user.type(input, "Утро");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(lastCall(fetchMock)).toMatchObject({
      method: "PATCH",
      body: { title: "Утро" },
    });
  });

  it("deletes a non-default category", async () => {
    const fetchMock = okFetch();
    const user = userEvent.setup();

    render(<CategoryManager categories={[root, child]} />);
    await user.click(screen.getByRole("button", { name: "Удалить" }));

    expect(lastCall(fetchMock)).toMatchObject({ method: "DELETE" });
    expect(lastCall(fetchMock).url).toContain("/admin/motivation/categories/cat-2");
  });

  it("reports a failed request on the affected row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "The default category cannot be deleted",
      }),
    );
    const user = userEvent.setup();

    render(<CategoryManager categories={[root, child]} />);
    await user.click(screen.getByRole("button", { name: "Удалить" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The default category cannot be deleted",
    );
  });
});
