import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Настоящий набор — почти две тысячи строк; панели в тесте хватит четырёх.
vi.mock("./emoji-data", () => ({
  EMOJI_ROWS: [
    ["😀", 0, "широко улыбается", "радость"],
    ["🙏", 0, "сложенные руки", "молитва спасибо"],
    ["🐶", 1, "морда собаки", "пёс"],
    ["❤️", 6, "алое сердце", "любовь"],
  ],
}));

// Набор администрации — без сети: тест не должен зависеть от API.
vi.mock("./favorite-emojis", async (importActual) => ({
  ...(await importActual<typeof import("./favorite-emojis")>()),
  loadDefaultFavoriteEmojis: () => Promise.resolve(["🙏", "❤️"]),
}));

import { ChatEmojiPicker } from "./chat-emoji-picker";
import { RECENT_EMOJI_KEY } from "./emoji-picker";
import { FAVORITE_EMOJI_KEY } from "./favorite-emojis";

beforeEach(() => {
  window.localStorage.clear();
});

describe("ChatEmojiPicker (VED-122)", () => {
  it("показывает категории и смайлики с русскими названиями", async () => {
    render(<ChatEmojiPicker onPick={vi.fn()} />);

    const categories = screen.getByRole("navigation", {
      name: "Категории смайликов",
    });
    expect(
      within(categories).getByRole("button", { name: "Животные и природа" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "морда собаки" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Символы" })).toBeInTheDocument();
  });

  it("находит смайлик по-русски", async () => {
    const user = userEvent.setup();
    render(<ChatEmojiPicker onPick={vi.fn()} />);
    await screen.findByRole("button", { name: "морда собаки" });

    await user.type(screen.getByRole("searchbox", { name: "Найти смайлик" }), "пёс");

    expect(screen.getByRole("button", { name: "морда собаки" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "алое сердце" })).toBeNull();

    await user.clear(screen.getByRole("searchbox", { name: "Найти смайлик" }));
    await user.type(screen.getByRole("searchbox", { name: "Найти смайлик" }), "жираф");
    expect(screen.getByText("Ничего не нашлось")).toBeInTheDocument();
  });

  it("отдаёт выбранный смайлик и ставит его первым в недавние", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<ChatEmojiPicker onPick={onPick} />);

    await user.click(await screen.findByRole("button", { name: "морда собаки" }));

    expect(onPick).toHaveBeenCalledWith("🐶");
    const recent = screen.getByRole("region", { name: "Недавние" });
    expect(within(recent).getAllByRole("button")[0]).toHaveTextContent("🐶");
    expect(JSON.parse(window.localStorage.getItem(RECENT_EMOJI_KEY) ?? "[]")[0]).toBe(
      "🐶",
    );
  });
});

describe("ChatEmojiPicker — «Избранные» (VED-123)", () => {
  it("первой категорией показывает набор администрации", async () => {
    render(<ChatEmojiPicker onPick={vi.fn()} />);

    const favorites = screen.getByRole("region", { name: "Избранные" });
    await within(favorites).findByRole("button", { name: "алое сердце" });
    expect(
      within(favorites)
        .getAllByRole("button")
        .filter((b) => b.textContent !== "Настроить")
        .map((b) => b.textContent),
    ).toEqual(["🙏", "❤️"]);
  });

  it("в настройке нажатие добавляет и убирает, а не вставляет смайлик", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<ChatEmojiPicker onPick={onPick} />);
    const favorites = screen.getByRole("region", { name: "Избранные" });
    await within(favorites).findByRole("button", { name: "алое сердце" });

    await user.click(within(favorites).getByRole("button", { name: "Настроить" }));
    // Добавить собаку из её категории…
    const animals = screen.getByRole("region", { name: "Животные и природа" });
    await user.click(within(animals).getByRole("button", { name: "морда собаки" }));
    // …и убрать сердце из избранного.
    await user.click(within(favorites).getByRole("button", { name: "алое сердце" }));

    expect(onPick).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(FAVORITE_EMOJI_KEY) ?? "null")).toEqual([
      "🙏",
      "🐶",
    ]);

    await user.click(within(favorites).getByRole("button", { name: "Готово" }));
    await user.click(within(favorites).getByRole("button", { name: "морда собаки" }));
    expect(onPick).toHaveBeenCalledWith("🐶");
  });

  it("свой набор возвращается к набору по умолчанию", async () => {
    window.localStorage.setItem(FAVORITE_EMOJI_KEY, JSON.stringify(["🐶"]));
    const user = userEvent.setup();
    render(<ChatEmojiPicker onPick={vi.fn()} />);
    const favorites = screen.getByRole("region", { name: "Избранные" });

    await user.click(within(favorites).getByRole("button", { name: "Настроить" }));
    await user.click(
      within(favorites).getByRole("button", { name: "Вернуть набор по умолчанию" }),
    );

    expect(window.localStorage.getItem(FAVORITE_EMOJI_KEY)).toBeNull();
    expect(
      await within(favorites).findByRole("button", { name: "алое сердце" }),
    ).toBeInTheDocument();
  });
});
