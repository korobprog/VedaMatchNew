import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  MusicIngestBatchDetailDto,
  MusicIngestItemDto,
} from "@vedamatch/shared";
import { IngestBatchForm } from "./ingest-batch-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const item = (over: Partial<MusicIngestItemDto>): MusicIngestItemDto => ({
  id: "i1",
  source: "url",
  sourceRef: "https://example.org/a.mp3",
  position: 0,
  status: "stored",
  failureReason: null,
  duplicateOfTrackId: null,
  track: null,
  ...over,
});

const batch = (
  over: Partial<MusicIngestBatchDetailDto> = {},
): MusicIngestBatchDetailDto => ({
  id: "b1",
  title: "Фестиваль",
  status: "running",
  itemCount: 3,
  storedCount: 1,
  failedCount: 0,
  sizeBytes: 1024,
  createdByName: "Админ",
  createdAt: new Date().toISOString(),
  rightsBasis: "open_program",
  rightsNote: null,
  artistId: null,
  albumId: null,
  categoryIds: [],
  language: null,
  isLiveRecording: false,
  quotaBytes: 20 * 1024 * 1024 * 1024,
  items: [],
  ...over,
});

function renderForm(detail: MusicIngestBatchDetailDto) {
  render(
    <IngestBatchForm
      batch={detail}
      artists={[]}
      albums={[]}
      categories={[]}
    />,
  );
}

describe("IngestBatchForm: «Опубликовать всё»", () => {
  it("пока приём идёт — кнопка неактивна и объясняет почему", () => {
    renderForm(
      batch({
        items: [
          item({ id: "i1", status: "stored" }),
          item({ id: "i2", status: "waiting" }),
          item({ id: "i3", status: "fetching" }),
        ],
      }),
    );

    const publish = screen.getByRole("button", { name: "Опубликовать всё" });
    expect(publish).toBeDisabled();
    // Молча погасшая кнопка выглядит поломкой, а не запретом.
    expect(publish).toHaveAttribute(
      "title",
      "Приём ещё идёт: 2 позиции в работе",
    );
    expect(
      screen.getByText(/Приём ещё идёт: 2 позиции в работе/),
    ).toBeInTheDocument();
  });

  it("всё доехало — кнопка активна и лишнего текста нет", () => {
    renderForm(
      batch({
        status: "ready",
        items: [
          item({ id: "i1", status: "stored" }),
          item({ id: "i2", status: "failed" }),
          item({ id: "i3", status: "skipped" }),
        ],
      }),
    );

    expect(
      screen.getByRole("button", { name: "Опубликовать всё" }),
    ).toBeEnabled();
    expect(screen.queryByText(/Приём ещё идёт/)).not.toBeInTheDocument();
  });
});
