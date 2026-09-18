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
const setMusicTracksArtist = vi.fn();

vi.mock("@/lib/music-admin-client-api", () => ({
  updateMusicTrack: (...args: unknown[]) => updateMusicTrack(...args),
  deleteMusicTrack: (...args: unknown[]) => deleteMusicTrack(...args),
  setMusicTracksArtist: (...args: unknown[]) => setMusicTracksArtist(...args),
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
  { id: "r1", title: "Традиционное", slug: "traditional", kind: "root" },
  { id: "c1", title: "Бхаджаны", slug: "bhajans", kind: "style" },
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
  setMusicTracksArtist.mockReset();
});

describe("MusicTrackList — массовая смена исполнителя (VED-226)", () => {
  const items = [
    track({ id: "t1", title: "Первая", artistId: "a1", artistName: "Аджамил" }),
    track({ id: "t2", title: "Вторая", artistId: "a1", artistName: "Аджамил" }),
    track({ id: "t3", title: "Третья" }),
  ];

  it("выбирает все записи исполнителя и переносит их к существующему", async () => {
    setMusicTracksArtist.mockResolvedValue({
      artist: { id: "a2", name: "Мадхава", slug: "madhava" },
      created: false,
      updated: 2,
    });
    renderList(items);

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Фильтр по исполнителю" }),
      "a1",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Выбрать все показанные \(2\)/ }),
    );
    const artistBar = screen.getByRole("region", {
      name: "Действия с выбранными записями",
    });
    expect(within(artistBar).getByText(/Выбрано: 2 записи/)).toBeInTheDocument();

    await userEvent.click(
      within(artistBar).getByRole("button", { name: "Сменить исполнителя" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Исполнитель для выбранных записей" }),
      "мадхава",
    );
    expect(
      screen.getByText(/перейдут к существующему исполнителю «Мадхава»/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(artistBar).getByRole("button", { name: "Применить" }),
    );

    expect(setMusicTracksArtist).toHaveBeenCalledWith({
      trackIds: ["t1", "t2"],
      artistName: "мадхава",
    });
    await waitFor(() =>
      expect(screen.getByText(/2 записи — теперь у исполнителя «Мадхава»/))
        .toBeInTheDocument(),
    );
    expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();
  });

  it("предупреждает, что незнакомое имя заведёт нового исполнителя", async () => {
    renderList(items);
    await userEvent.click(screen.getByRole("checkbox", { name: "Выбрать «Третья»" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Сменить исполнителя" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Исполнитель для выбранных записей" }),
      "Гаура  дас",
    );
    expect(
      screen.getByText("Такого исполнителя нет — будет заведён новый: «Гаура дас»."),
    ).toBeInTheDocument();
  });
});

describe("MusicTrackList", () => {
  it("правка предзаполнена тем, что стоит у записи сейчас", async () => {
    const user = userEvent.setup();
    renderList([
      track({ artistId: "a2", categoryIds: ["c1"] }),
    ]);

    await user.click(screen.getByLabelText("Править «Durga Chalisa»"));

    // Без идентификаторов в DTO селект показывал бы первый пункт списка, и
    // сохранение молча перевешивало бы запись на чужого исполнителя.
    expect(screen.getByLabelText("Исполнитель")).toHaveValue("a2");
    // VED-165-2: корневая категория здесь больше не спрашивается — она
    // переехала на исполнителя; остаётся один селект, стиль.
    expect(screen.queryByLabelText("Корневая")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Стиль")).toHaveValue("c1");
    expect(screen.getByLabelText("Духовная линия")).toHaveValue(
      "sri_chaitanya_gaudiya_math",
    );
  });

  it("шлёт только тронутое: правка названия не затирает линию и разделы", async () => {
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

  it("выбор стиля сохраняется как есть", async () => {
    const user = userEvent.setup();
    renderList([track({ categoryIds: [] })]);

    await user.click(screen.getByLabelText("Править «Durga Chalisa»"));
    await user.selectOptions(screen.getByLabelText("Стиль"), "c1");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(updateMusicTrack).toHaveBeenCalledWith("t1", {
        categoryIds: ["c1"],
      }),
    );
  });

  it("снятие стиля отправляет пустой список категорий", async () => {
    const user = userEvent.setup();
    renderList([track({ categoryIds: ["c1"] })]);

    await user.click(screen.getByLabelText("Править «Durga Chalisa»"));
    await user.selectOptions(screen.getByLabelText("Стиль"), "Не указан");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(updateMusicTrack).toHaveBeenCalledWith("t1", {
        categoryIds: [],
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
