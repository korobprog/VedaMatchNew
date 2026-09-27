import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicRadioItemDto, MusicTrackDto } from "@vedamatch/shared";
import { MusicRadioBar } from "./radio-bar";
import { useMusicRadio, type MusicRadioApi } from "./radio-provider";

vi.mock("./radio-provider", () => ({ useMusicRadio: vi.fn() }));

const track = {
  id: "t1",
  title: "Трек",
  coverUrl: null,
  artist: { name: "Исполнитель" },
} as MusicTrackDto;

const item = (over: Partial<MusicRadioItemDto> = {}): MusicRadioItemDto => ({
  slotId: "s1",
  kind: "track",
  startsAt: "2030-01-01T10:00:00.000Z",
  durationMs: 200_000,
  track,
  insertTitle: null,
  streamUrl: "https://s3/t1.mp3",
  ...over,
});

function radio(over: Partial<MusicRadioApi> = {}): MusicRadioApi {
  return {
    active: true,
    loading: false,
    item: item(),
    listeners: 1,
    error: null,
    paused: false,
    start: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
    refreshListeners: vi.fn(),
    handoffToPlayer: vi.fn(),
    ...over,
  };
}

beforeEach(() => vi.mocked(useMusicRadio).mockReset());

describe("MusicRadioBar — обложка ведёт в плеер (VED-542)", () => {
  it("обложка записи — кнопка «Слушать в плеере»", async () => {
    const api = radio();
    vi.mocked(useMusicRadio).mockReturnValue(api);
    const user = userEvent.setup();
    render(<MusicRadioBar />);

    expect(screen.getByText("Исполнитель — Трек")).toBeTruthy();
    const cover = screen.getByRole("button", { name: "Слушать в плеере" });
    await user.click(cover);
    expect(api.handoffToPlayer).toHaveBeenCalledTimes(1);
    expect(api.stop).not.toHaveBeenCalled();
  });

  it("доступна с клавиатуры", async () => {
    const api = radio();
    vi.mocked(useMusicRadio).mockReturnValue(api);
    const user = userEvent.setup();
    render(<MusicRadioBar />);

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Слушать в плеере" }),
    );
    await user.keyboard("{Enter}");
    expect(api.handoffToPlayer).toHaveBeenCalledTimes(1);
  });

  it("во вставке и в пустом эфире кнопки нет", () => {
    vi.mocked(useMusicRadio).mockReturnValue(
      radio({
        item: item({ kind: "insert", track: null, insertTitle: "Анонс" }),
      }),
    );
    const { rerender } = render(<MusicRadioBar />);
    expect(screen.queryByRole("button", { name: "Слушать в плеере" })).toBe(
      null,
    );

    vi.mocked(useMusicRadio).mockReturnValue(
      radio({ item: null, loading: true }),
    );
    rerender(<MusicRadioBar />);
    expect(screen.queryByRole("button", { name: "Слушать в плеере" })).toBe(
      null,
    );
    expect(
      screen.getByRole("button", { name: "Выключить радио" }),
    ).toBeTruthy();
  });

  it("радио выключено — полосы нет", () => {
    vi.mocked(useMusicRadio).mockReturnValue(radio({ active: false }));
    const { container } = render(<MusicRadioBar />);
    expect(container.innerHTML).toBe("");
  });
});
