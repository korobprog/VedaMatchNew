import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MusicReferenceList,
  type MusicReferenceRow,
} from "./reference-list";
import { updateMusicArtist } from "@/lib/music-admin-client-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/music-admin-client-api", () => ({
  deleteMusicAlbum: vi.fn(),
  deleteMusicArtist: vi.fn(),
  deleteMusicCategory: vi.fn(),
  updateMusicAlbum: vi.fn(),
  updateMusicArtist: vi.fn(),
  updateMusicCategory: vi.fn(),
}));
// Настоящее поле обложки тянет заливку в бакет: здесь важно, что уходит на
// сервер, а не как выбирается файл.
vi.mock("@/components/music/cover-field", () => ({
  MusicCoverField: ({
    onChange,
  }: {
    onChange: (key: string | null) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange("music/covers/artist/u/1.jpg")}>
        Выбрать файл
      </button>
      <button type="button" onClick={() => onChange(null)}>
        Снять
      </button>
    </div>
  ),
}));

const artist: MusicReferenceRow = {
  id: "a1",
  primary: "Avantika devi dasi",
  secondary: "19 записей",
  badge: null,
  coverUrl: null,
};

function renderList(rows: MusicReferenceRow[] = [artist]) {
  render(
    <MusicReferenceList
      kind="artist"
      title="Исполнители"
      empty="Пока никого."
      rows={rows}
    />,
  );
}

beforeEach(() => vi.mocked(updateMusicArtist).mockReset());

describe("MusicReferenceList — обложка (VED-19)", () => {
  it("сохраняет выбранную обложку у заведённого исполнителя", async () => {
    vi.mocked(updateMusicArtist).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderList();

    await user.click(
      screen.getByRole("button", { name: "Обложка «Avantika devi dasi»" }),
    );
    await user.click(screen.getByRole("button", { name: "Выбрать файл" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMusicArtist).toHaveBeenCalledWith("a1", {
      coverKey: "music/covers/artist/u/1.jpg",
    });
  });

  // Нажатие сразу после открытия сняло бы обложку, которая уже стоит.
  it("пока обложку не трогали, сохранять нечего", async () => {
    const user = userEvent.setup();
    renderList([{ ...artist, coverUrl: "https://api.test/cover.jpg" }]);

    await user.click(
      screen.getByRole("button", { name: "Обложка «Avantika devi dasi»" }),
    );

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(updateMusicArtist).not.toHaveBeenCalled();
  });

  it("«Снять» и сохранение убирают обложку", async () => {
    vi.mocked(updateMusicArtist).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderList([{ ...artist, coverUrl: "https://api.test/cover.jpg" }]);

    await user.click(
      screen.getByRole("button", { name: "Обложка «Avantika devi dasi»" }),
    );
    await user.click(screen.getByRole("button", { name: "Снять" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMusicArtist).toHaveBeenCalledWith("a1", { coverKey: null });
  });

  it("у раздела каталога обложки нет", () => {
    render(
      <MusicReferenceList
        kind="category"
        title="Разделы"
        empty="Пусто."
        rows={[{ id: "c1", primary: "Киртан", secondary: "0 записей", badge: null }]}
      />,
    );

    expect(screen.queryByRole("button", { name: /Обложка/ })).toBeNull();
  });
});
