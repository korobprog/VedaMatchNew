import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTrack } from "@/lib/music-playback-api";
import { hasVisibleLyrics, useTrackLyrics } from "./use-track-lyrics";

vi.mock("@/lib/music-playback-api", () => ({ getTrack: vi.fn() }));

describe("hasVisibleLyrics", () => {
  it("нет записи — нечего показывать", () => {
    expect(hasVisibleLyrics(null)).toBe(false);
  });

  it("все три поля пустые — нечего показывать", () => {
    expect(
      hasVisibleLyrics({ lyrics: null, transliteration: null, translation: null }),
    ).toBe(false);
  });

  it("пустые строки и одни пробелы считаются пустотой (админ не до конца очистил поле)", () => {
    expect(
      hasVisibleLyrics({ lyrics: "", transliteration: "   ", translation: "\n" }),
    ).toBe(false);
  });

  it("текст оригинала непустой — кнопка нужна", () => {
    expect(
      hasVisibleLyrics({
        lyrics: "Харе Кришна",
        transliteration: null,
        translation: null,
      }),
    ).toBe(true);
  });

  it("непустая только транслитерация — тоже кнопка нужна", () => {
    expect(
      hasVisibleLyrics({
        lyrics: null,
        transliteration: "Hare Krishna",
        translation: null,
      }),
    ).toBe(true);
  });

  it("непустой только перевод — тоже кнопка нужна", () => {
    expect(
      hasVisibleLyrics({
        lyrics: null,
        transliteration: null,
        translation: "О Господь Кришна",
      }),
    ).toBe(true);
  });
});

/** Зонд: рендерит состояние хука текстом, чтобы проверять его через `screen`. */
function Probe({ trackId }: { trackId: string | undefined }) {
  const { lyrics, loading } = useTrackLyrics(trackId);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="lyrics">{lyrics?.lyrics ?? "нет"}</span>
    </div>
  );
}

function lyricsOf(text: string) {
  return { lyrics: text, transliteration: null, translation: null };
}

beforeEach(() => {
  vi.mocked(getTrack).mockReset();
});

describe("useTrackLyrics", () => {
  it("гонка: устаревший ответ прежней записи не перезаписывает уже показанный текст новой", async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(getTrack).mockImplementationOnce(() => first as never);
    vi.mocked(getTrack).mockImplementationOnce(() =>
      Promise.resolve({ lyrics: lyricsOf("Текст B") } as never),
    );

    const { rerender } = render(<Probe trackId="a" />);
    rerender(<Probe trackId="b" />);

    await screen.findByText("Текст B");

    // Ответ на запись «a» приходит только теперь, уже после того, как на
    // экране запись «b», — устаревший `.then` не должен применить его.
    resolveFirst({ lyrics: lyricsOf("Текст A") });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId("lyrics")).toHaveTextContent("Текст B");
  });

  it("возврат к уже дочитанной записи берёт текст из кэша, а не ходит в сеть повторно", async () => {
    vi.mocked(getTrack).mockImplementation((id: string) =>
      Promise.resolve({ lyrics: lyricsOf(`Текст ${id}`) } as never),
    );

    const { rerender } = render(<Probe trackId="a" />);
    await screen.findByText("Текст a");

    rerender(<Probe trackId="b" />);
    await screen.findByText("Текст b");

    rerender(<Probe trackId="a" />);
    await screen.findByText("Текст a");

    // Дважды — по одному разу на «a» и «b»; повторный показ «a» кэширован.
    expect(getTrack).toHaveBeenCalledTimes(2);
  });

  it("сетевая ошибка и 404 приходят одинаково пустым ответом — кнопки нет, хук не падает", async () => {
    // `getTrack` идёт через `quiet()` (music-playback-api.ts) и сам гасит
    // и сетевые исключения, и 404 в `null` — с точки зрения хука это один
    // и тот же случай.
    vi.mocked(getTrack).mockResolvedValue(null);

    render(<Probe trackId="a" />);

    await screen.findByText("нет");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("без trackId ничего не запрашивает", () => {
    render(<Probe trackId={undefined} />);

    expect(getTrack).not.toHaveBeenCalled();
    expect(screen.getByTestId("lyrics")).toHaveTextContent("нет");
  });
});
