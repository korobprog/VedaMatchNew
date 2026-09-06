import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MusicAdminTrackDto,
  MusicAlbumDto,
  MusicArtistDto,
  MusicCategoryDto,
} from "@vedamatch/shared";
import { MusicTrackList } from "./track-list";

const updateMusicTrack = vi.fn();
const deleteMusicTrack = vi.fn();

vi.mock("@/lib/music-admin-client-api", () => ({
  updateMusicTrack: (...args: unknown[]) => updateMusicTrack(...args),
  deleteMusicTrack: (...args: unknown[]) => deleteMusicTrack(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const track = (over: Partial<MusicAdminTrackDto> = {}): MusicAdminTrackDto => ({
  id: "t1",
  title: "Durga Chalisa",
  status: "published",
  artistName: null,
  albumTitle: null,
  durationSeconds: 286,
  sizeBytes: 11_000_000,
  createdAt: "2026-09-01T00:00:00.000Z",
  publishedAt: "2026-09-01T00:00:00.000Z",
  artistId: null,
  albumId: null,
  categoryIds: [],
  isLiveRecording: false,
  lineage: "sri_chaitanya_gaudiya_math",
  ...over,
});

const artists = [
  { id: "a1", name: "Аджамил", slug: "ajamil" },
  { id: "a2", name: "Мадхава", slug: "madhava" },
] as unknown as MusicArtistDto[];
const albums = [
  { id: "al1", title: "Вечерняя арати" },
] as unknown as MusicAlbumDto[];
const categories = [
  { id: "c1", title: "Бхаджаны", slug: "bhajans" },
] as unknown as MusicCategoryDto[];

function renderList(items: MusicAdminTrackDto[] = [track()]) {
  return render(
    <MusicTrackList
      tracks={items}
      total={items.length}
      artists={artists}
      albums={albums}
      categories={categories}
    />,
  );
}

beforeEach(() => {
  updateMusicTrack.mockReset().mockResolvedValue({});
  deleteMusicTrack.mockReset().mockResolvedValue({});
});

describe("MusicTrackList", () => {
  it("правка предзаполнена тем, что стоит у записи сейчас", async () => {
    const user = userEvent.setup();
    renderList([track({ artistId: "a2", categoryIds: ["c1"] })]);

    await user.click(screen.getByLabelText("Править «Durga Chalisa»"));

    // Без идентификаторов в DTO селект показывал бы первый пункт списка, и
    // сохранение молча перевешивало бы запись на чужого исполнителя.
    expect(screen.getByLabelText("Исполнитель")).toHaveValue("a2");
    expect(screen.getByLabelText("Раздел")).toHaveValue("c1");
    expect(screen.getByLabelText("Духовная линия")).toHaveValue(
      "sri_chaitanya_gaudiya_math",
    );
  });

  it("шлёт только тронутое: правка названия не затирает линию и раздел", async () => {
    const user = userEvent.setup();
    renderList([track({ categoryIds: ["c1"] })]);

    await user.click(screen.getByLabelText("Править «Durga Chalisa»"));
    const title = screen.getByLabelText("Название");
    await user.clear(title);
    await user.type(title, "Дурга-чалиса");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(updateMusicTrack).toHaveBeenCalledWith("t1", {
        title: "Дурга-чалиса",
      }),
    );
  });

  it("линию можно снять — запись становится для всех линий", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByLabelText("Править «Durga Chalisa»"));
    await user.selectOptions(
      screen.getByLabelText("Духовная линия"),
      "Для всех линий",
    );
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    // `null`, а не `"all"`: значение варианта в списке — строка `"all"`, и
    // отправленная как есть она получала от сервера 400 «Неизвестная
    // духовная линия».
    await waitFor(() =>
      expect(updateMusicTrack).toHaveBeenCalledWith("t1", { lineage: null }),
    );
  });

  it("«Сохранить» заперто, пока ничего не тронули", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByLabelText("Править «Durga Chalisa»"));

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  it("удаление спрашивает подтверждение и только потом зовёт сервер", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByLabelText("Удалить «Durga Chalisa»"));
    expect(deleteMusicTrack).not.toHaveBeenCalled();

    const row = screen.getByRole("listitem");
    await user.click(within(row).getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(deleteMusicTrack).toHaveBeenCalledWith("t1"));
  });
});
