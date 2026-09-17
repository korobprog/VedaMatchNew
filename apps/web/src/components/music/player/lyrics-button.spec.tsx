import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackLyricsDto } from "@vedamatch/shared";
import { MusicLyricsButton } from "./lyrics-button";
import { useTrackLyrics } from "./use-track-lyrics";

vi.mock("./use-track-lyrics", async () => {
  const actual =
    await vi.importActual<typeof import("./use-track-lyrics")>(
      "./use-track-lyrics",
    );
  return { ...actual, useTrackLyrics: vi.fn() };
});

function mockLyrics(lyrics: MusicTrackLyricsDto | null) {
  vi.mocked(useTrackLyrics).mockReturnValue({ lyrics, loading: false });
}

beforeEach(() => vi.mocked(useTrackLyrics).mockReset());

describe("MusicLyricsButton", () => {
  it("не рисует ничего, пока у записи нет текста", () => {
    mockLyrics(null);
    const { container } = render(
      <MusicLyricsButton trackId="t1" className="ctrl" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("не рисует ничего, если во всех трёх полях пусто", () => {
    mockLyrics({ lyrics: "  ", transliteration: null, translation: "" });
    const { container } = render(
      <MusicLyricsButton trackId="t1" className="ctrl" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("показывает кнопку и открывает панель по нажатию", async () => {
    mockLyrics({
      lyrics: "Харе Кришна",
      transliteration: null,
      translation: null,
    });
    const user = userEvent.setup();
    render(<MusicLyricsButton trackId="t1" className="ctrl" />);

    const button = screen.getByRole("button", { name: "Текст бхаджана" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    // Имя кнопки меняется при открытии — тот же приём, что у соседней
    // кнопки очереди в этом же файле (mini-player.tsx).
    expect(button).toHaveAccessibleName("Закрыть текст");
    expect(
      screen.getByRole("dialog", { name: "Текст бхаджана" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Харе Кришна")).toBeInTheDocument();
  });

  it("закрывается по кнопке «Закрыть текст» и возвращает фокус на кнопку-триггер", async () => {
    mockLyrics({
      lyrics: "Харе Кришна",
      transliteration: null,
      translation: null,
    });
    const user = userEvent.setup();
    render(<MusicLyricsButton trackId="t1" className="ctrl" />);

    const trigger = screen.getByRole("button", { name: "Текст бхаджана" });
    await user.click(trigger);
    // Оба — и триггер в открытом состоянии, и своя кнопка панели — названы
    // «Закрыть текст» (тот же приём, что у очереди: `queue-panel.tsx` и
    // триггер очереди в `mini-player.tsx` тоже делят одно имя), поэтому
    // кнопку панели ищем именно внутри диалога, а не по всему документу.
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Закрыть текст",
      }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("закрывается по Esc и возвращает фокус на кнопку-триггер", async () => {
    mockLyrics({
      lyrics: "Харе Кришна",
      transliteration: null,
      translation: null,
    });
    const user = userEvent.setup();
    render(<MusicLyricsButton trackId="t1" className="ctrl" />);

    const trigger = screen.getByRole("button", { name: "Текст бхаджана" });
    await user.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("смена записи закрывает открытую панель", async () => {
    mockLyrics({
      lyrics: "Харе Кришна",
      transliteration: null,
      translation: null,
    });
    const user = userEvent.setup();
    const { rerender } = render(
      <MusicLyricsButton trackId="t1" className="ctrl" />,
    );

    await user.click(screen.getByRole("button", { name: "Текст бхаджана" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    mockLyrics({
      lyrics: "Другой текст",
      transliteration: null,
      translation: null,
    });
    rerender(<MusicLyricsButton trackId="t2" className="ctrl" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
