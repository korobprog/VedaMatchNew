import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackLyricsDto } from "@vedamatch/shared";
import { MusicLyricsPanel } from "./lyrics-panel";
import { useMusicPlayer } from "./player-provider";

vi.mock("./player-provider", () => ({ useMusicPlayer: vi.fn() }));

const lyrics: MusicTrackLyricsDto = {
  lyrics: "Харе Кришна",
  transliteration: null,
  translation: null,
};

function player(over: Record<string, unknown> = {}) {
  return { isMusicEditor: false, ...over };
}

beforeEach(() => vi.mocked(useMusicPlayer).mockReset());

// VED-269: кнопка «редактировать текст» — только у редакции Музыки.
describe("MusicLyricsPanel — кнопка «редактировать» по правам", () => {
  it("не рисует кнопку редактирования, когда прав нет", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(player() as never);
    render(
      <MusicLyricsPanel trackId="t1" lyrics={lyrics} onClose={vi.fn()} />,
    );

    expect(
      screen.queryByRole("link", { name: "Редактировать текст" }),
    ).not.toBeInTheDocument();
  });

  it("не рисует кнопку, если плеера нет вовсе (страница без провайдера)", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(null);
    render(
      <MusicLyricsPanel trackId="t1" lyrics={lyrics} onClose={vi.fn()} />,
    );

    expect(
      screen.queryByRole("link", { name: "Редактировать текст" }),
    ).not.toBeInTheDocument();
  });

  it("показывает кнопку редакции Музыки, ссылка ведёт на форму правки этой записи", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(
      player({ isMusicEditor: true }) as never,
    );
    render(
      <MusicLyricsPanel trackId="t42" lyrics={lyrics} onClose={vi.fn()} />,
    );

    expect(
      screen.getByRole("link", { name: "Редактировать текст" }),
    ).toHaveAttribute("href", "/music/tracks/t42?edit=lyrics");
  });

  it("кнопка «Закрыть текст» работает и рядом с кнопкой редактирования", async () => {
    const onClose = vi.fn();
    vi.mocked(useMusicPlayer).mockReturnValue(
      player({ isMusicEditor: true }) as never,
    );
    render(
      <MusicLyricsPanel trackId="t1" lyrics={lyrics} onClose={onClose} />,
    );

    screen.getByRole("button", { name: "Закрыть текст" }).click();
    expect(onClose).toHaveBeenCalled();
  });
});
