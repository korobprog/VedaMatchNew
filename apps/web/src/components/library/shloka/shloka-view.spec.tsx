import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LibraryShlokaDto } from "@vedamatch/shared";
import { ShlokaDisclosure } from "./shloka-disclosure";
import { ShlokaView } from "./shloka-view";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/library/entry/sh-2",
}));

function shloka(over: Partial<LibraryShlokaDto> = {}): LibraryShlokaDto {
  return {
    id: "sh-2",
    titleRu: "Бхагавад-гита 2.13",
    source: "Бхагавад-гита",
    verse: "2.13",
    text: "देहिनोऽस्मिन्यथा देहे\n\ndehino 'smin yathā dehe",
    wordByWord: "dehinaḥ — воплощённого",
    translation: "Как воплощённая душа",
    commentary: "Первый абзац.\n\nВторой абзац.",
    contentLanguage: "ru",
    images: [],
    acharyas: [
      {
        id: "ac-1",
        acharya: "Шридхара Свами",
        text: null,
        wordByWord: null,
        translation: null,
        commentary: "Толкование ачарьи",
        images: [],
      },
    ],
    category: {
      id: "cat",
      slug: "bhagavad-gita",
      titleRu: "Бхагавад-гита",
      titleEn: null,
    },
    prev: { id: "sh-1", verse: "2.2" },
    next: { id: "sh-3", verse: "2.14" },
    position: 3,
    total: 7,
    canEdit: false,
    bookmarked: false,
    bookmarkCount: 0,
    commentsCount: 0,
    addedBy: null,
    publishedAt: "2026-09-24T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});

describe("ShlokaDisclosure", () => {
  it("первое нажатие разворачивает, второе сворачивает", () => {
    render(
      <ShlokaDisclosure title="Комментарий">
        <p>Текст комментария</p>
      </ShlokaDisclosure>,
    );
    const button = screen.getByRole("button", { name: "Комментарий" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Текст комментария")).not.toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Текст комментария")).toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("кнопка — внутри заголовка нужного уровня", () => {
    render(
      <ShlokaDisclosure title="Пословный перевод" level={4}>
        x
      </ShlokaDisclosure>,
    );
    expect(
      screen.getByRole("heading", { level: 4, name: "Пословный перевод" }),
    ).toBeInTheDocument();
  });
});

describe("ShlokaView", () => {
  it("показывает стих, место в источнике и стрелки к соседям", () => {
    render(<ShlokaView locale="ru" shloka={shloka()} initialMode="read" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Бхагавад-гита 2.13" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 из 7/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Предыдущая шлока: 2.2" }),
    ).toHaveAttribute("href", "/library/entry/sh-1");
    expect(
      screen.getByRole("link", { name: "Следующая шлока: 2.14" }),
    ).toHaveAttribute("href", "/library/entry/sh-3");
    expect(screen.getByText("Как воплощённая душа")).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Шридхара Свами" }))
      .toBeInTheDocument();
  });

  it("стрелки клавиатуры листают, а из поля ввода — нет", () => {
    render(<ShlokaView locale="ru" shloka={shloka()} initialMode="read" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(push).toHaveBeenCalledWith("/library/entry/sh-3");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push).toHaveBeenLastCalledWith("/library/entry/sh-1");
  });

  it("читателю переключатель правки не показывается", () => {
    render(<ShlokaView locale="ru" shloka={shloka()} initialMode="edit" />);
    expect(screen.queryByRole("button", { name: /Правка/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("автор переключает чтение и правку, режим пишется в адрес", () => {
    render(
      <ShlokaView
        locale="ru"
        shloka={shloka({ canEdit: true })}
        initialMode="read"
      />,
    );
    const edit = screen.getByRole("button", { name: /Правка/ });
    expect(edit).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(edit);
    expect(edit).toHaveAttribute("aria-pressed", "true");
    expect(replace).toHaveBeenCalledWith("/library/entry/sh-2?mode=edit", {
      scroll: false,
    });
    expect(screen.getAllByLabelText(/Текст шлоки/)[0]).toHaveValue(shloka().text);
    // В правке стрелки ведут в правку соседней шлоки.
    expect(
      screen.getAllByRole("link", { name: /Следующая шлока/ })[0],
    ).toHaveAttribute("href", "/library/entry/sh-3?mode=edit");
  });
});
