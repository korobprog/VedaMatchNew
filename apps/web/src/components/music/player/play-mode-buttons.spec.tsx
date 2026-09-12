import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MusicPlayModeButtons } from "./play-mode-buttons";
import { useMusicPlayer } from "./player-provider";

vi.mock("./player-provider", () => ({ useMusicPlayer: vi.fn() }));

function player(over: Record<string, unknown> = {}) {
  return {
    current: null,
    queue: [] as string[],
    shuffle: false,
    play: vi.fn(),
    setRepeat: vi.fn(),
    toggleShuffle: vi.fn(),
    ...over,
  };
}

beforeEach(() => vi.mocked(useMusicPlayer).mockReset());

describe("MusicPlayModeButtons", () => {
  it("первое нажатие включает одну запись и снимает повтор", async () => {
    const p = player();
    vi.mocked(useMusicPlayer).mockReturnValue(p as never);
    const user = userEvent.setup();
    render(<MusicPlayModeButtons queue={["a", "b", "c"]} />);

    await user.click(screen.getByRole("button", { name: "Слушать один трек" }));

    // Очередь из одной записи: дойдя до конца, плееру некуда идти.
    expect(p.play).toHaveBeenCalledWith("a", ["a"]);
    expect(p.setRepeat).toHaveBeenCalledWith("off");
  });

  it("второе нажатие раскрывает весь список до конца", async () => {
    const p = player({ current: { id: "a" }, queue: ["a"] });
    vi.mocked(useMusicPlayer).mockReturnValue(p as never);
    const user = userEvent.setup();
    render(<MusicPlayModeButtons queue={["a", "b", "c"]} />);

    await user.click(screen.getByRole("button", { name: "Слушать всё до конца" }));

    expect(p.play).toHaveBeenCalledWith("a", ["a", "b", "c"]);
    expect(p.setRepeat).toHaveBeenCalledWith("off");
  });

  // Порядок задаёт кнопка: «Слушать» после «Перемешать» не должна остаться
  // вперемешку, иначе подпись врёт.
  it("упорядоченный запуск выключает перемешивание, случайный включает", async () => {
    const p = player({ shuffle: true });
    vi.mocked(useMusicPlayer).mockReturnValue(p as never);
    const user = userEvent.setup();
    render(<MusicPlayModeButtons queue={["a", "b"]} />);

    await user.click(screen.getByRole("button", { name: "Слушать один трек" }));
    expect(p.toggleShuffle).toHaveBeenCalledTimes(1);

    p.toggleShuffle.mockClear();
    await user.click(screen.getByRole("button", { name: "Перемешать" }));
    // Перемешивание уже включено — второй раз трогать его незачем.
    expect(p.toggleShuffle).not.toHaveBeenCalled();
    expect(p.play).toHaveBeenLastCalledWith(expect.any(String), ["a", "b"]);
  });

  it("пустой список кнопок не рисует", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(player() as never);
    const { container } = render(<MusicPlayModeButtons queue={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
