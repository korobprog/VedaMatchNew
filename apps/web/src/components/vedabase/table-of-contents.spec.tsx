import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TableOfContents } from "./table-of-contents";

function chapter(slug: string, order: number, title = `Глава ${slug}`) {
  return { slug, title, order, file: `${slug}.json` };
}

const bhagavatam = [
  chapter("1-1", 1, "Вопросы мудрецов"),
  chapter("1-2", 2, "Божественность и божественное служение"),
  chapter("2-1", 3, "Первая ступень осознания Бога"),
];

describe("TableOfContents", () => {
  it("собирает главы Бхагаватам по песням", () => {
    render(
      <TableOfContents
        bookSlug="srimad-bhagavatam"
        chapters={bhagavatam}
        currentChapterSlug="1-1"
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Песнь 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Песнь 2/ })).toBeInTheDocument();
  });

  it("раскрывает ту песнь, в которой человек читает", () => {
    render(
      <TableOfContents
        bookSlug="srimad-bhagavatam"
        chapters={bhagavatam}
        currentChapterSlug="2-1"
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Песнь 2/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: /Песнь 1/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // Главы закрытой песни не занимают экран.
    expect(screen.queryByText("Вопросы мудрецов")).not.toBeInTheDocument();
    expect(screen.getByText("Первая ступень осознания Бога")).toBeInTheDocument();
  });

  it("раскрывает песнь по нажатию", async () => {
    const user = userEvent.setup();
    render(
      <TableOfContents
        bookSlug="srimad-bhagavatam"
        chapters={bhagavatam}
        currentChapterSlug="2-1"
        onNavigate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Песнь 1/ }));

    expect(screen.getByText("Вопросы мудрецов")).toBeInTheDocument();
  });

  it("у Чайтанья-чаритамриты песни называются лилами", () => {
    render(
      <TableOfContents
        bookSlug="chaitanya-charitamrita"
        chapters={[chapter("1-1", 1), chapter("2-1", 2)]}
        currentChapterSlug="1-1"
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Ади-лила/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Мадхья-лила/ })).toBeInTheDocument();
  });

  it("книга без песней остаётся плоским списком без заголовков групп", () => {
    render(
      <TableOfContents
        bookSlug="bhagavad-gita"
        chapters={[chapter("1", 1, "Обзор армий"), chapter("2", 2, "Душа")]}
        currentChapterSlug="1"
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText("Обзор армий")).toBeInTheDocument();
    expect(screen.getByText("Душа")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Песнь/ })).not.toBeInTheDocument();
  });

  it("открывает главу по нажатию", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <TableOfContents
        bookSlug="bhagavad-gita"
        chapters={[chapter("1", 1, "Обзор армий")]}
        currentChapterSlug="2"
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Обзор армий" }));

    expect(onNavigate).toHaveBeenCalledWith("1");
  });

  it("помечает текущую главу для скринридера", () => {
    render(
      <TableOfContents
        bookSlug="srimad-bhagavatam"
        chapters={bhagavatam}
        currentChapterSlug="1-2"
        onNavigate={vi.fn()}
      />,
    );

    const list = screen.getByRole("button", {
      name: "Божественность и божественное служение",
    });
    expect(list).toHaveAttribute("aria-current", "page");
  });

  it("считает главы в каждой песни", () => {
    render(
      <TableOfContents
        bookSlug="srimad-bhagavatam"
        chapters={bhagavatam}
        currentChapterSlug="1-1"
        onNavigate={vi.fn()}
      />,
    );

    const first = screen.getByRole("button", { name: /Песнь 1/ });
    expect(within(first).getByText(/2/)).toBeInTheDocument();
  });

  it("не молчит на книге без оглавления", () => {
    render(
      <TableOfContents
        bookSlug="bhagavad-gita"
        chapters={[]}
        currentChapterSlug=""
        onNavigate={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Оглавление этой книги пока не загружено."),
    ).toBeInTheDocument();
  });
});
