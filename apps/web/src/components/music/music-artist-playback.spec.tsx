import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import { MusicArtistPlayback } from "./music-artist-playback";

const player = vi.hoisted(() => ({
  value: {
    current: null as null | { id: string },
    isPlaying: false,
    isLoading: false,
    queue: [] as string[],
    shuffle: false,
    play: vi.fn(),
    toggle: vi.fn(),
    setPlayMode: vi.fn(),
    toggleShuffle: vi.fn(),
  },
}));
vi.mock("./player/player-provider", () => ({
  useMusicPlayer: () => player.value,
}));

function track(over: Partial<MusicTrackDto>): MusicTrackDto {
  return {
    id: over.id ?? "id",
    title: over.title ?? "Название",
    artist: null,
    album: null,
    categories: [],
    durationSeconds: 100,
    coverUrl: null,
    language: null,
    isLiveRecording: false,
    lineage: null,
    playCount: 0,
    publishedAt: over.publishedAt ?? null,
    ...over,
  };
}

// Три записи: порядок публикации намеренно не совпадает с алфавитным, чтобы
// сортировки различались видимо. По дате (новые сверху): Ямуна, Бхаджан,
// Арати. По алфавиту: Арати, Бхаджан, Ямуна.
const tracks = [
  track({ id: "b", title: "Бхаджан", publishedAt: "2026-03-01T00:00:00.000Z" }),
  track({ id: "a", title: "Арати", publishedAt: "2026-01-01T00:00:00.000Z" }),
  track({ id: "y", title: "Ямуна", publishedAt: "2026-06-01T00:00:00.000Z" }),
];

function rowTitles() {
  return within(screen.getByRole("list"))
    .getAllByRole("button")
    .map((row) => row.textContent ?? "");
}

beforeEach(() => {
  player.value.play.mockClear();
  player.value.setPlayMode.mockClear();
  player.value.toggleShuffle.mockClear();
  player.value.current = null;
  player.value.shuffle = false;
});

describe("MusicArtistPlayback", () => {
  it("по умолчанию — «по дате добавления», новые сверху (как отдал сервер)", () => {
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x" />,
    );

    expect(
      screen.getByRole("button", { name: "По дате добавления" }),
    ).toHaveAttribute("aria-pressed", "true");
    const titles = rowTitles().join("|");
    expect(titles.indexOf("Ямуна")).toBeLessThan(titles.indexOf("Бхаджан"));
    expect(titles.indexOf("Бхаджан")).toBeLessThan(titles.indexOf("Арати"));
  });

  it("«По алфавиту» переупорядочивает строки по названию", async () => {
    const user = userEvent.setup();
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x" />,
    );

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));

    const titles = rowTitles().join("|");
    expect(titles.indexOf("Арати")).toBeLessThan(titles.indexOf("Бхаджан"));
    expect(titles.indexOf("Бхаджан")).toBeLessThan(titles.indexOf("Ямуна"));
  });

  it("значок разворота переворачивает текущий видимый порядок", async () => {
    const user = userEvent.setup();
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x" />,
    );

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));
    await user.click(
      screen.getByRole("button", { name: /Обратный порядок/ }),
    );

    const titles = rowTitles().join("|");
    expect(titles.indexOf("Ямуна")).toBeLessThan(titles.indexOf("Бхаджан"));
    expect(titles.indexOf("Бхаджан")).toBeLessThan(titles.indexOf("Арати"));
  });

  it("кнопка внутри строки запускает именно ту запись, очередь идёт в видимом порядке", async () => {
    const user = userEvent.setup();
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x" />,
    );

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));
    await user.click(screen.getByRole("button", { name: /Бхаджан/ }));

    expect(player.value.play).toHaveBeenCalledWith("b", ["a", "b", "y"]);
  });

  // VED-159, круг 2: «Слушать»/«Перемешать» должны идти по тому же порядку,
  // что видит человек после сортировки — не по исходному порядку с сервера.
  it("«Слушать» ставит очередь в исходном порядке, пока сортировка «По дате»", async () => {
    const user = userEvent.setup();
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x" />,
    );

    await user.click(screen.getByRole("button", { name: "Слушать" }));

    expect(player.value.play).toHaveBeenCalledWith("y", ["y", "b", "a"]);
  });

  it("«Слушать» ставит очередь в алфавитном порядке после переключения сортировки", async () => {
    const user = userEvent.setup();
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x" />,
    );

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));
    await user.click(screen.getByRole("button", { name: "Слушать" }));

    expect(player.value.play).toHaveBeenCalledWith("a", ["a", "b", "y"]);
  });

  it("«Слушать» учитывает и разворот, ставленный поверх алфавитной сортировки", async () => {
    const user = userEvent.setup();
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x" />,
    );

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));
    await user.click(
      screen.getByRole("button", { name: /Обратный порядок/ }),
    );
    await user.click(screen.getByRole("button", { name: "Слушать" }));

    expect(player.value.play).toHaveBeenCalledWith("y", ["y", "b", "a"]);
  });

  it("«Перемешать» получает то же множество записей, что видно в списке (алфавитная сортировка)", async () => {
    const user = userEvent.setup();
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x" />,
    );

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));
    await user.click(screen.getByRole("button", { name: "Перемешать" }));

    expect(player.value.toggleShuffle).toHaveBeenCalledTimes(1);
    const [, queue] = player.value.play.mock.calls.at(-1) ?? [];
    expect(queue).toEqual(expect.arrayContaining(["a", "b", "y"]));
    expect(queue).toHaveLength(3);
  });

  it("дети (био, альбомы) рендерятся между кнопками и секцией «Записи»", () => {
    render(
      <MusicArtistPlayback tracks={tracks} isMusicEditor={false} uploadHref="/x">
        <p data-testid="bio">Био исполнителя</p>
      </MusicArtistPlayback>,
    );

    expect(screen.getByTestId("bio")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Записи" })).toBeInTheDocument();
  });

  it("редактору музыки показывает ссылку «Загрузить треки»", () => {
    render(
      <MusicArtistPlayback
        tracks={tracks}
        isMusicEditor
        uploadHref="/music/uploads?artist=shanti"
      />,
    );

    expect(
      screen.getByRole("link", { name: /Загрузить треки/ }),
    ).toHaveAttribute("href", "/music/uploads?artist=shanti");
  });
});
