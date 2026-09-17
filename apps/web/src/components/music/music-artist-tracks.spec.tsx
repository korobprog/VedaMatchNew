import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import { MusicArtistTracks } from "./music-artist-tracks";

const player = vi.hoisted(() => ({
  value: {
    current: null,
    isPlaying: false,
    isLoading: false,
    queue: [] as string[],
    play: vi.fn(),
    toggle: vi.fn(),
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
// сортировки различались видимо.
const tracks = [
  track({ id: "b", title: "Бхаджан", publishedAt: "2026-03-01T00:00:00.000Z" }),
  track({ id: "a", title: "Арати", publishedAt: "2026-01-01T00:00:00.000Z" }),
  track({ id: "y", title: "Ямуна", publishedAt: "2026-06-01T00:00:00.000Z" }),
];

// Строки записей живут в единственном <ul> компонента — кнопки
// сортировки/разворота стоят снаружи него, поэтому здесь ровно три кнопки,
// в видимом (текущем) порядке.
function rowTitles() {
  return within(screen.getByRole("list"))
    .getAllByRole("button")
    .map((row) => row.textContent ?? "");
}

beforeEach(() => {
  player.value.play.mockClear();
  player.value.current = null;
});

describe("MusicArtistTracks", () => {
  it("по умолчанию — «по дате добавления», новые сверху (как отдал сервер)", () => {
    render(<MusicArtistTracks tracks={tracks} />);

    expect(
      screen.getByRole("button", { name: "По дате добавления" }),
    ).toHaveAttribute("aria-pressed", "true");
    const titles = rowTitles().join("|");
    // Ямуна (июнь) → Бхаджан (март) → Арати (январь).
    expect(titles.indexOf("Ямуна")).toBeLessThan(titles.indexOf("Бхаджан"));
    expect(titles.indexOf("Бхаджан")).toBeLessThan(titles.indexOf("Арати"));
  });

  it("«По алфавиту» переупорядочивает строки по названию", async () => {
    const user = userEvent.setup();
    render(<MusicArtistTracks tracks={tracks} />);

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));

    expect(
      screen.getByRole("button", { name: "По алфавиту" }),
    ).toHaveAttribute("aria-pressed", "true");
    const titles = rowTitles().join("|");
    expect(titles.indexOf("Арати")).toBeLessThan(titles.indexOf("Бхаджан"));
    expect(titles.indexOf("Бхаджан")).toBeLessThan(titles.indexOf("Ямуна"));
  });

  it("значок разворота переворачивает текущий видимый порядок", async () => {
    const user = userEvent.setup();
    render(<MusicArtistTracks tracks={tracks} />);

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));
    await user.click(
      screen.getByRole("button", { name: /Обратный порядок/ }),
    );

    const titles = rowTitles().join("|");
    expect(titles.indexOf("Ямуна")).toBeLessThan(titles.indexOf("Бхаджан"));
    expect(titles.indexOf("Бхаджан")).toBeLessThan(titles.indexOf("Арати"));
  });

  it("переключение обратно на «По дате добавления» возвращает исходный порядок", async () => {
    const user = userEvent.setup();
    render(<MusicArtistTracks tracks={tracks} />);

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));
    await user.click(
      screen.getByRole("button", { name: "По дате добавления" }),
    );

    const titles = rowTitles().join("|");
    expect(titles.indexOf("Ямуна")).toBeLessThan(titles.indexOf("Бхаджан"));
    expect(titles.indexOf("Бхаджан")).toBeLessThan(titles.indexOf("Арати"));
  });

  it("кнопка внутри строки запускает именно ту запись, на которую нажали, а очередь идёт в видимом порядке", async () => {
    const user = userEvent.setup();
    render(<MusicArtistTracks tracks={tracks} />);

    await user.click(screen.getByRole("button", { name: "По алфавиту" }));
    await user.click(screen.getByRole("button", { name: /Бхаджан/ }));

    // Видимый порядок по алфавиту: Арати, Бхаджан, Ямуна — «дальше» после
    // Бхаджана обязан вести на Ямуну, а не на исходный порядок с сервера.
    expect(player.value.play).toHaveBeenCalledWith("b", ["a", "b", "y"]);
  });
});
