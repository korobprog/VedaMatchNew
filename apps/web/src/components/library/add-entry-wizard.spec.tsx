import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import { AddEntryWizard } from "./add-entry-wizard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const tree: LibraryCategoryTreeNode[] = [
  {
    id: "s1",
    parentId: null,
    slug: "philosophy",
    titleRu: "Философия и писания",
    titleEn: "Philosophy",
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth: 0,
    entriesCount: 0,
    subtreeEntriesCount: 0,
    childrenCount: 1,
    createdAt: "2026-08-23T00:00:00.000Z",
    canEdit: false,
    canMove: false,
    children: [
      {
        id: "c1",
        parentId: "s1",
        slug: "prabhupada",
        titleRu: "Шрила Прабхупада",
        titleEn: "Srila Prabhupada",
        descriptionRu: null,
        descriptionEn: null,
        iconKey: null,
        position: 0,
        depth: 1,
        entriesCount: 0,
        subtreeEntriesCount: 0,
        childrenCount: 0,
        createdAt: "2026-08-23T00:00:00.000Z",
        canEdit: false,
        canMove: false,
        children: [],
      },
    ],
  },
];

function setup() {
  return render(
    <AddEntryWizard locale="ru" tree={tree} />,
  );
}

/** Проходит первый шаг, выбрав тип материала. */
async function pickType(user: ReturnType<typeof userEvent.setup>, type: string) {
  await user.selectOptions(screen.getByLabelText("Тип материала"), type);
  await user.click(screen.getByRole("button", { name: "Далее" }));
}

describe("AddEntryWizard", () => {
  it("начинается с типа — от него зависит, что спросят дальше", () => {
    setup();

    expect(screen.getByText(/Шаг 1 из 4/)).toBeInTheDocument();
    expect(screen.getByLabelText("Тип материала")).toBeInTheDocument();
    // У типа и языка всегда есть значение, ждать нечего.
    expect(screen.getByRole("button", { name: "Далее" })).toBeEnabled();
  });

  it("не пускает со второго шага, пока адрес не абсолютный", async () => {
    const user = userEvent.setup();
    setup();
    await pickType(user, "video");

    await user.type(screen.getByLabelText("Адрес ссылки"), "example.com");
    await user.type(
      screen.getByLabelText("Заголовок по-русски"),
      "Как проходит киртан",
    );

    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
  });

  it("для книги сразу предлагает источник вместо ссылки", async () => {
    const user = userEvent.setup();
    setup();
    await pickType(user, "book");

    expect(screen.getByLabelText("Источник")).toBeInTheDocument();
    expect(screen.queryByLabelText("Адрес ссылки")).not.toBeInTheDocument();
  });

  it("переключатель меняет поле, а выбор человека тип не перебивает", async () => {
    const user = userEvent.setup();
    setup();
    await pickType(user, "video");

    expect(screen.getByLabelText("Адрес ссылки")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Только источник"));

    expect(screen.getByLabelText("Источник")).toBeInTheDocument();
    expect(screen.queryByLabelText("Адрес ссылки")).not.toBeInTheDocument();
  });

  it("возвращает на предыдущий шаг и сохраняет введённое", async () => {
    const user = userEvent.setup();
    setup();
    await pickType(user, "video");

    await user.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/kirtan",
    );
    await user.click(screen.getByRole("button", { name: "Назад" }));
    await user.click(screen.getByRole("button", { name: "Далее" }));

    expect(screen.getByLabelText("Адрес ссылки")).toHaveValue(
      "https://example.com/kirtan",
    );
  });

  it("доходит до проверки со ссылкой и показывает сводку", async () => {
    const user = userEvent.setup();
    setup();
    await pickType(user, "video");

    await user.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/kirtan",
    );
    await user.type(
      screen.getByLabelText("Заголовок по-русски"),
      "Как проходит киртан",
    );
    await user.click(screen.getByRole("button", { name: "Далее" }));

    // Третий шаг: без категории дальше не пускает.
    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
    await user.click(screen.getByLabelText("Шрила Прабхупада"));
    await user.click(screen.getByRole("button", { name: "Далее" }));

    expect(screen.getByText(/Шаг 4 из 4/)).toBeInTheDocument();
    expect(screen.getByText("https://example.com/kirtan")).toBeInTheDocument();
    expect(screen.getByText("Как проходит киртан")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeEnabled();
  });

  it("доходит до отправки материала из книги — без всякой ссылки", async () => {
    const user = userEvent.setup();
    setup();
    await pickType(user, "book");

    await user.type(screen.getByLabelText("Источник"), "Бхагавад-гита 9.22");
    await user.type(
      screen.getByLabelText("Заголовок по-русски"),
      "О преданном служении",
    );
    await user.click(screen.getByRole("button", { name: "Далее" }));

    await user.click(screen.getByLabelText("Шрила Прабхупада"));
    await user.click(screen.getByRole("button", { name: "Далее" }));

    // В сводке на месте адреса — источник.
    expect(screen.getByText("Бхагавад-гита 9.22")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeEnabled();
  });
});
