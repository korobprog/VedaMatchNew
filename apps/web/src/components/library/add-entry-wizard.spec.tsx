import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LibraryCategoryDto, LibrarySectionDto } from "@vedamatch/shared";
import { AddEntryWizard } from "./add-entry-wizard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const sections: LibrarySectionDto[] = [
  {
    id: "s1",
    slug: "philosophy",
    titleRu: "Философия и писания",
    titleEn: "Philosophy",
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    categoriesCount: 1,
    entriesCount: 0,
    canEdit: false,
  },
];

const categories: LibraryCategoryDto[] = [
  {
    id: "c1",
    sectionId: "s1",
    sectionSlug: "philosophy",
    slug: "prabhupada",
    titleRu: "Шрила Прабхупада",
    titleEn: "Srila Prabhupada",
    descriptionRu: null,
    descriptionEn: null,
    entriesCount: 0,
    createdAt: "2026-08-23T00:00:00.000Z",
    canEdit: false,
  },
];

function setup() {
  return render(
    <AddEntryWizard
      locale="ru"
      sections={sections}
      categories={categories}
      initialSectionSlug="philosophy"
    />,
  );
}

describe("AddEntryWizard", () => {
  it("начинается с первого шага и не пускает дальше без ссылки", () => {
    setup();

    expect(screen.getByText(/Шаг 1 из 4/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
  });

  it("не считает шаг готовым, пока адрес не абсолютный", async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText("Адрес ссылки"), "example.com");

    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
  });

  it("пускает на второй шаг после корректной ссылки", async () => {
    const user = userEvent.setup();
    setup();

    await user.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/kirtan",
    );
    await user.click(screen.getByRole("button", { name: "Далее" }));

    expect(screen.getByText(/Шаг 2 из 4/)).toBeInTheDocument();
    expect(screen.getByLabelText("Заголовок по-русски")).toBeInTheDocument();
  });

  it("возвращает на предыдущий шаг и сохраняет введённое", async () => {
    const user = userEvent.setup();
    setup();

    await user.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/kirtan",
    );
    await user.click(screen.getByRole("button", { name: "Далее" }));
    await user.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByLabelText("Адрес ссылки")).toHaveValue(
      "https://example.com/kirtan",
    );
  });

  it("доходит до проверки и показывает сводку выбранного", async () => {
    const user = userEvent.setup();
    setup();

    await user.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/kirtan",
    );
    await user.click(screen.getByRole("button", { name: "Далее" }));

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
});
