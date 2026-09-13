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

import { ChatEmojiPicker } from "./chat-emoji-picker";
import { RECENT_EMOJI_KEY } from "./emoji-picker";

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
