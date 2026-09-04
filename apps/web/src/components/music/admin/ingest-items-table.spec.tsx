import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MusicIngestItemDto } from "@vedamatch/shared";
import { IngestItemsTable } from "./ingest-items-table";

const item = (over: Partial<MusicIngestItemDto> = {}): MusicIngestItemDto => ({
  id: "i1",
  source: "upload",
  sourceRef: "kirtan.mp3",
  position: 0,
  status: "stored",
  failureReason: null,
  duplicateOfTrackId: null,
  track: null,
  ...over,
});

describe("IngestItemsTable", () => {
  it("показывает причину падения словами, а не кодом", () => {
    render(
      <IngestItemsTable
        items={[item({ status: "failed", failureReason: "сервер ответил 403" })]}
        onApplyToSelected={vi.fn()}
      />,
    );

    expect(screen.getByText(/сервер ответил 403/)).toBeInTheDocument();
  });

  it("дубль показывает ссылкой на существующую запись, а не ошибкой", () => {
    render(
      <IngestItemsTable
        items={[item({ status: "skipped", duplicateOfTrackId: "t9" })]}
        onApplyToSelected={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: /уже есть в каталоге/i }),
    ).toHaveAttribute("href", "/music/tracks/t9");
  });

  it("массовое действие получает только отмеченные строки", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <IngestItemsTable
        // Имена файлов разные не для красоты: подпись у чекбокса — это
        // `sourceRef`, и на двух одинаковых `getByRole` нашёл бы обе строки.
        items={[item({ id: "a" }), item({ id: "b", sourceRef: "arati.mp3" })]}
        onApplyToSelected={onApply}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /kirtan.mp3/ }));
    await user.click(screen.getByRole("button", { name: /Применить к отмеченным/ }));

    expect(onApply).toHaveBeenCalledWith(["a"]);
  });
});
