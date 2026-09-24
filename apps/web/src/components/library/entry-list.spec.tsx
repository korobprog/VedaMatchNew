import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntryList } from "./entry-list";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const empty = { items: [], nextCursor: null, total: 0 };

describe("EntryList — пустая лента", () => {
  // VED-396: блок «Для вашей линии здесь пока ничего нет · Показать
  // материалы всех линий» убран — линию показывает ряд кнопок над рубриками.
  it("при фильтре по линии ничего не пишет", () => {
    const { container } = render(
      <EntryList initialFeed={empty} locale="ru" query={{}} lineageFiltered />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/всех линий/)).toBeNull();
  });

  it("без фильтра по линии говорит, что пока пусто", () => {
    render(<EntryList initialFeed={empty} locale="ru" query={{}} />);

    expect(screen.getByText("Пока ничего не добавлено")).toBeInTheDocument();
  });
});
