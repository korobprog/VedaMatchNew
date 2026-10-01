import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MusicArtistDto,
  MusicCategoryDto,
  MusicModerationItemDto,
} from "@vedamatch/shared";
import { MusicModerationCard } from "./moderation-card";
import { MusicModerationQueue } from "./moderation-queue";

const setMusicTracksArtist = vi.fn();
const updateMusicTrack = vi.fn();
const decideMusicTrack = vi.fn();

vi.mock("@/lib/music-admin-client-api", () => ({
  setMusicTracksArtist: (...args: unknown[]) => setMusicTracksArtist(...args),
  updateMusicTrack: (...args: unknown[]) => updateMusicTrack(...args),
  decideMusicTrack: (...args: unknown[]) => decideMusicTrack(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const item = (
  over: { id?: string; title?: string } = {},
): MusicModerationItemDto =>
  ({
    track: {
      id: over.id ?? "t1",
      title: over.title ?? "Первая запись",
      artist: null,
      categories: [],
      isLiveRecording: false,
      lineage: null,
      durationSeconds: 286,
      sizeBytes: 11_000_000,
    },
    uploader: { id: "u1", name: "Редакция" },
    rightsBasis: "own_recording",
    uploadedAt: "2026-09-30T00:00:00.000Z",
  }) as unknown as MusicModerationItemDto;

const artists = [
  { id: "a1", name: "Аджамил", slug: "ajamil" },
  { id: "a2", name: "Мадхава", slug: "madhava" },
] as unknown as MusicArtistDto[];
const categories = [
  { id: "c1", title: "Бхаджаны", slug: "bhajans", kind: "style" },
] as unknown as MusicCategoryDto[];

beforeEach(() => {
  setMusicTracksArtist.mockReset();
  updateMusicTrack.mockReset().mockResolvedValue({});
  decideMusicTrack.mockReset().mockResolvedValue({});
});

describe("MusicModerationQueue — массовый выбор (VED-688)", () => {
  const items = [
    item({ id: "t1", title: "Первая" }),
    item({ id: "t2", title: "Вторая" }),
  ];

  it("выбирает все карточки одной галочкой и назначает исполнителя", async () => {
    setMusicTracksArtist.mockResolvedValue({
      artist: { id: "a2", name: "Мадхава", slug: "madhava" },
      created: false,
      updated: 2,
    });
    render(
      <MusicModerationQueue
        items={items}
        artists={artists}
        categories={categories}
      />,
    );

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: /Выбрать все показанные \(2\)/,
      }),
    );
    const bar = screen.getByRole("region", {
      name: "Действия с выбранными записями",
    });
    expect(within(bar).getByText(/Выбрано: 2 записи/)).toBeInTheDocument();

    await userEvent.click(
      within(bar).getByRole("button", { name: "Сменить исполнителя" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", {
        name: "Исполнитель для выбранных записей",
      }),
      "мадхава",
    );
    await userEvent.click(
      within(bar).getByRole("button", { name: "Применить" }),
    );

    expect(setMusicTracksArtist).toHaveBeenCalledWith({
      trackIds: ["t1", "t2"],
      artistName: "мадхава",
    });
    // Итог виден после применения — и выбор снят.
    await waitFor(() =>
      expect(
        screen.getByText(/2 записи — теперь у исполнителя «Мадхава»/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();
  });

  it("галочка в карточке выбирает только её", async () => {
    render(
      <MusicModerationQueue
        items={items}
        artists={artists}
        categories={categories}
      />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Выбрать «Первая»" }));

    expect(screen.getByRole("checkbox", { name: "Выбрать «Первая»" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Выбрать «Вторая»" })).not.toBeChecked();
    expect(screen.getByText(/Выбрано: 1 запись/)).toBeInTheDocument();
    // Общая галочка показывает неполный выбор, а не «все».
    const all = screen.getByRole("checkbox", {
      name: /Выбрать все показанные \(2\)/,
    });
    expect(all).not.toBeChecked();
  });

  it("карточка без пропса selection галочки не показывает", () => {
    render(
      <MusicModerationCard
        item={item()}
        artists={artists}
        categories={categories}
      />,
    );
    expect(screen.queryByLabelText(/^Выбрать «/)).not.toBeInTheDocument();
    // Одиночный поток на месте: карточка по-прежнему решает публикацию сама.
    expect(
      screen.getByRole("button", { name: "Опубликовать" }),
    ).toBeInTheDocument();
  });
});
