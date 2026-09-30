import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VedabaseChapterDocument } from "@vedamatch/shared";
import { ChapterContent } from "./chapter-content";

const chapter = {
  bookSlug: "bg",
  slug: "2",
  title: "Глава 2",
  order: 2,
  units: [
    {
      id: "bg-2-66",
      title: "Бхагавад-гита 2.66",
      sourceUrl: "",
      transliterationHtml: "<p>нāсти буддхир айуктасйа</p>",
      synonymsHtml: "<p>на-асти — не существует; буддхих̣ — разум</p>",
    },
  ],
} as unknown as VedabaseChapterDocument;

function select(testId: string, start: number, end: number) {
  const text = screen.getByTestId(testId).querySelector("p")!.firstChild!;
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
}

/* VED-683: цветной перевод. */
describe("ChapterContent: цветной перевод", () => {
  it("читатель видит кнопку только у раскрашенного блока и включает раскраску", async () => {
    const user = userEvent.setup();
    render(
      <ChapterContent
        chapter={chapter}
        onUnitActivate={() => {}}
        colorings={[
          {
            unitId: "bg-2-66",
            block: "transliterationHtml",
            spans: [{ start: 0, end: 5, color: "blue" }],
          },
        ]}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Цветной перевод" });
    expect(buttons).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Править раскраску" }),
    ).toBeNull();

    await user.click(buttons[0]);
    const block = screen.getByTestId("block-bg-2-66-transliterationHtml");
    await waitFor(() =>
      expect(block.querySelector(".reader-color-blue")?.textContent).toBe(
        "нāсти",
      ),
    );
  });

  it("админ красит выделенное и сохраняет", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ChapterContent
        chapter={chapter}
        onUnitActivate={() => {}}
        canEditColors
        onSaveColoring={onSave}
      />,
    );
    await user.click(
      screen.getAllByRole("button", { name: "Цветной перевод" })[1],
    );
    await user.click(screen.getByRole("button", { name: "Править раскраску" }));

    select("block-bg-2-66-synonymsHtml", 0, 7);
    fireEvent.click(screen.getByRole("button", { name: "Зелёный" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSave).toHaveBeenCalledWith({
      chapterSlug: "2",
      unitId: "bg-2-66",
      block: "synonymsHtml",
      spans: [{ start: 0, end: 7, color: "green" }],
    });
  });

  it("выделение в другом блоке — подсказка, а не раскраска", async () => {
    const user = userEvent.setup();
    render(
      <ChapterContent
        chapter={chapter}
        onUnitActivate={() => {}}
        canEditColors
        onSaveColoring={vi.fn()}
      />,
    );
    await user.click(
      screen.getAllByRole("button", { name: "Цветной перевод" })[1],
    );
    await user.click(screen.getByRole("button", { name: "Править раскраску" }));
    select("block-bg-2-66-transliterationHtml", 0, 5);
    fireEvent.click(screen.getByRole("button", { name: "Красный" }));
    expect(screen.getByText(/именно в этом блоке/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });
});
