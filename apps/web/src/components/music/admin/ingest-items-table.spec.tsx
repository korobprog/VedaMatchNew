import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MusicIngestItemDto } from "@vedamatch/shared";
import { IngestItemsTable } from "./ingest-items-table";

/**
 * Раскладок две — таблица для широкого экрана и карточки для телефона, —
 * и переключает их CSS (`hidden md:block` / `md:hidden`). jsdom стилей не
 * считает, поэтому в тесте обе лежат в документе одновременно: то, что видно
 * пользователю ровно один раз, здесь встречается дважды, и спрашивать про
 * такие узлы надо `getAllBy*`. Это и есть проверка, что ни одно поле и ни
 * одно действие не потерялось при переносе в карточку.
 */
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

const track = (): NonNullable<MusicIngestItemDto["track"]> => ({
  id: "t1",
  title: "Мангала-арати",
  artist: null,
  album: null,
  categories: [],
  durationSeconds: 320,
  coverUrl: null,
  language: null,
  isLiveRecording: false,
  playCount: 0,
  publishedAt: null,
});

describe("IngestItemsTable", () => {
  it("показывает причину падения словами, а не кодом", () => {
    render(
      <IngestItemsTable
        items={[item({ status: "failed", failureReason: "сервер ответил 403" })]}
        onApplyToSelected={vi.fn()}
      />,
    );

    // По одной причине на раскладку: и в таблице, и в карточке.
    expect(screen.getAllByText(/сервер ответил 403/)).toHaveLength(2);
  });

  it("дубль показывает ссылкой на существующую запись, а не ошибкой", () => {
    render(
      <IngestItemsTable
        items={[item({ status: "skipped", duplicateOfTrackId: "t9" })]}
        onApplyToSelected={vi.fn()}
      />,
    );

    const links = screen.getAllByRole("link", { name: /уже есть в каталоге/i });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/music/tracks/t9");
    }
  });

  it("массовое действие получает только отмеченные строки", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <IngestItemsTable
        // Имена файлов разные не для красоты: подпись у чекбокса — это
        // `sourceRef`, и на двух одинаковых обе позиции слились бы в одну
        // выборку.
        items={[item({ id: "a" }), item({ id: "b", sourceRef: "arati.mp3" })]}
        onApplyToSelected={onApply}
      />,
    );

    // Отмечаем в карточке — первой в документе идёт она.
    const [card] = screen.getAllByRole("checkbox", { name: /kirtan.mp3/ });
    await user.click(card!);
    await user.click(
      screen.getByRole("button", { name: /Применить к отмеченным/ }),
    );

    expect(onApply).toHaveBeenCalledWith(["a"]);
  });

  it("отметка в одной раскладке видна во второй: состояние одно на обе", async () => {
    const user = userEvent.setup();
    render(
      <IngestItemsTable items={[item()]} onApplyToSelected={vi.fn()} />,
    );

    const boxes = screen.getAllByRole<HTMLInputElement>("checkbox", {
      name: "kirtan.mp3",
    });
    expect(boxes).toHaveLength(2);

    await user.click(boxes[0]!);

    expect(boxes[0]!.checked).toBe(true);
    expect(boxes[1]!.checked).toBe(true);
  });

  it("поля и удаление позиции доступны в обеих раскладках", () => {
    const onRemove = vi.fn();
    render(
      <IngestItemsTable
        items={[item({ track: track() })]}
        onApplyToSelected={vi.fn()}
        onRemove={onRemove}
      />,
    );

    for (const name of [
      "Название: kirtan.mp3",
      "Исполнитель: kirtan.mp3",
      "Альбом: kirtan.mp3",
      "Убрать «kirtan.mp3» из партии",
    ]) {
      expect(screen.getAllByLabelText(name)).toHaveLength(2);
    }
  });
});
