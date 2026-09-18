import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicArtistDto, MusicTrackDetailDto } from "@vedamatch/shared";
import { MusicTrackAdminEditor } from "./track-admin-editor";

const updateMusicTrack = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();
// `let`, а не `const`: тесты на `?edit=lyrics` меняют значение перед
// рендером — `vi.hoisted` поднимает объявление над `vi.mock` ниже.
const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("@/lib/music-admin-client-api", () => ({
  updateMusicTrack: (...args: unknown[]) => updateMusicTrack(...args),
}));
vi.mock("@/lib/music-client-api", () => ({ uploadMusicCover: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  usePathname: () => "/music/tracks/t1",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const track = {
  id: "t1",
  title: "Maha Mantra",
  artist: { id: "a1", slug: "shanti-people", name: "Shanti people" },
  lyrics: { lyrics: "Харе Кришна", transliteration: null, translation: null },
} as unknown as MusicTrackDetailDto;

const artists = [
  { id: "a1", name: "Shanti people" },
  { id: "a2", name: "Avantika" },
] as MusicArtistDto[];

beforeEach(() => {
  updateMusicTrack.mockReset().mockResolvedValue({});
  refresh.mockReset();
  replace.mockReset();
  nav.search = "";
  Element.prototype.scrollIntoView = vi.fn();
});

describe("MusicTrackAdminEditor", () => {
  it("свёрнут, пока не нажали «Редактировать запись»", () => {
    render(<MusicTrackAdminEditor track={track} artists={artists} />);

    expect(screen.queryByLabelText("Название")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Редактировать запись" }),
    ).toBeInTheDocument();
  });

  it("без правок «Сохранить» не нажимается", async () => {
    const user = userEvent.setup();
    render(<MusicTrackAdminEditor track={track} artists={artists} />);

    await user.click(screen.getByRole("button", { name: "Редактировать запись" }));

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  it("уходит только изменённое: название, исполнитель и перевод (VED-102, VED-109)", async () => {
    const user = userEvent.setup();
    render(<MusicTrackAdminEditor track={track} artists={artists} />);

    await user.click(screen.getByRole("button", { name: "Редактировать запись" }));
    await user.clear(screen.getByLabelText("Название"));
    await user.type(screen.getByLabelText("Название"), "Маха-мантра");
    await user.selectOptions(screen.getByLabelText("Исполнитель"), "a2");
    await user.type(screen.getByLabelText("Перевод"), "О Кришна");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(updateMusicTrack).toHaveBeenCalledWith("t1", {
        title: "Маха-мантра",
        artistId: "a2",
        translation: "О Кришна",
      }),
    );
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Сохранено");
  });

  // VED-269: кнопка-карандаш в панели текста плеера ведёт сюда по ссылке
  // `?edit=lyrics` — форма обязана раскрыться сама, без клика по
  // «Редактировать запись».
  describe("открытие по ?edit=lyrics (VED-269)", () => {
    it("раскрывает форму и ставит фокус в «Текст бхаджана»", () => {
      nav.search = "edit=lyrics";
      render(<MusicTrackAdminEditor track={track} artists={artists} />);

      const field = screen.getByLabelText("Текст бхаджана");
      expect(field).toBeInTheDocument();
      expect(field).toHaveFocus();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it("без параметра форма остаётся свёрнутой, как обычно", () => {
      render(<MusicTrackAdminEditor track={track} artists={artists} />);

      expect(screen.queryByLabelText("Текст бхаджана")).not.toBeInTheDocument();
    });

    it("«Отмена» снимает параметр из адреса", async () => {
      nav.search = "edit=lyrics";
      const user = userEvent.setup();
      render(<MusicTrackAdminEditor track={track} artists={artists} />);

      await user.click(screen.getByRole("button", { name: "Отмена" }));

      expect(replace).toHaveBeenCalledWith("/music/tracks/t1", {
        scroll: false,
      });
    });

    it("сохранение через ссылку тоже снимает параметр из адреса", async () => {
      nav.search = "edit=lyrics";
      const user = userEvent.setup();
      render(<MusicTrackAdminEditor track={track} artists={artists} />);

      await user.clear(screen.getByLabelText("Текст бхаджана"));
      await user.type(screen.getByLabelText("Текст бхаджана"), "Ом");
      await user.click(screen.getByRole("button", { name: "Сохранить" }));

      await waitFor(() => expect(updateMusicTrack).toHaveBeenCalled());
      expect(replace).toHaveBeenCalledWith("/music/tracks/t1", {
        scroll: false,
      });
    });

    it("сохраняет соседние параметры адреса, снимая только свой", async () => {
      nav.search = "edit=lyrics&from=player";
      const user = userEvent.setup();
      render(<MusicTrackAdminEditor track={track} artists={artists} />);

      await user.click(screen.getByRole("button", { name: "Отмена" }));

      expect(replace).toHaveBeenCalledWith("/music/tracks/t1?from=player", {
        scroll: false,
      });
    });
  });
});
