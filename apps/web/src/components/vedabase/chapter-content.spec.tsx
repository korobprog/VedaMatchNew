import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VedabaseChapterDocument } from "@vedamatch/shared";
import { ChapterContent } from "./chapter-content";

const copyText = vi.fn<(text: string) => Promise<boolean>>();
vi.mock("@/lib/copy-text", () => ({
  copyText: (text: string) => copyText(text),
}));

const chapter = {
  units: [
    {
      id: "bg-2-14",
      title: "Бхагавад-гита 2.14",
      sourceUrl: "https://vedabase.ru/bg/2/14",
      originalHtml: null,
      transliterationHtml: null,
      synonymsHtml: null,
      translationHtml: "<p>О сын Кунти, счастье и страдание приходят и уходят.</p>",
      purportHtml: "<p>Первый абзац комментария.</p><p>Второй абзац.</p>",
      bodyHtml: null,
    },
  ],
} as unknown as VedabaseChapterDocument;

beforeEach(() => {
  copyText.mockReset();
});

describe("ChapterContent: копирование разделов (VED-130)", () => {
  it("копирует комментарий отдельно от перевода", async () => {
    copyText.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ChapterContent chapter={chapter} onUnitActivate={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Копировать: Бхагавад-гита 2.14, Комментарий",
      }),
    );

    expect(copyText).toHaveBeenCalledWith(
      "Первый абзац комментария.\n\nВторой абзац.",
    );
    expect(await screen.findByText("Скопировано")).toBeInTheDocument();
  });

  it("копирует перевод отдельно от комментария", async () => {
    copyText.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ChapterContent chapter={chapter} onUnitActivate={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Копировать: Бхагавад-гита 2.14, Перевод",
      }),
    );

    expect(copyText).toHaveBeenCalledWith(
      "О сын Кунти, счастье и страдание приходят и уходят.",
    );
  });

  it("говорит, если скопировать не вышло", async () => {
    copyText.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ChapterContent chapter={chapter} onUnitActivate={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Копировать: Бхагавад-гита 2.14, Перевод",
      }),
    );

    expect(await screen.findByText("Не скопировалось")).toBeInTheDocument();
  });

  it("у пустого раздела кнопки нет", () => {
    render(<ChapterContent chapter={chapter} onUnitActivate={() => {}} />);
    expect(screen.getAllByRole("button", { name: /^Копировать:/ })).toHaveLength(2);
  });
});
