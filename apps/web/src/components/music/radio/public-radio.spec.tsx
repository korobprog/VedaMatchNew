import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MusicRadioPublicStateDto } from "@vedamatch/shared";
import {
  fetchPublicMusicRadio,
  fetchPublicSharedTrack,
} from "@/lib/music-radio-client";
import { PublicRadio } from "./public-radio";

vi.mock("@/lib/music-radio-client", () => ({
  fetchPublicMusicRadio: vi.fn(),
  fetchPublicSharedTrack: vi.fn(),
}));

function makeState(
  overrides: Partial<MusicRadioPublicStateDto> = {},
): MusicRadioPublicStateDto {
  const now = new Date();
  return {
    serverTime: now.toISOString(),
    current: {
      slotId: "slot-1",
      kind: "track",
      startsAt: new Date(now.getTime() - 10_000).toISOString(),
      durationMs: 300_000,
      track: {
        title: "Шри Гуруваштака",
        artist: { name: "Хор общины" },
        coverUrl: null,
      } as never,
      insertTitle: null,
      streamUrl: "https://s/1.mp3",
    },
    next: null,
    listeners: 12,
    listenerAvatars: ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"],
    listenerNames: ["Нитай", "Радха"],
    listenerCities: 4,
    recent: [
      {
        slotId: "slot-0",
        startsAt: new Date(now.getTime() - 400_000).toISOString(),
        trackId: "track-0",
        title: "Нрисимха кавача",
        artistName: "Хор общины",
      },
    ],
    ...overrides,
  };
}

/* VED-645: публичная страница радио. */
describe("PublicRadio", () => {
  it("показывает эфир, слушателей с аватарками и кнопки установки", async () => {
    vi.mocked(fetchPublicMusicRadio).mockResolvedValue(makeState());
    const { container } = render(
      <PublicRadio manifest={null} showTelegram={false} />,
    );

    expect(await screen.findByText("Шри Гуруваштака")).toBeInTheDocument();
    expect(screen.getByText("Сейчас слушают 12 человек")).toBeInTheDocument();
    expect(container.querySelectorAll("img[src^='https://a/']")).toHaveLength(
      3,
    );
    expect(screen.getByText("+9")).toBeInTheDocument();
    expect(
      screen.getByText("Нитай, Радха и ещё 10 человек из 4 городов"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Слушать эфир" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /iPhone и iPad/ })).toHaveAttribute(
      "href",
      "https://ios.vedamatch.com",
    );
    expect(screen.queryByRole("link", { name: /Telegram/ })).toBeNull();
  });

  it("мало слушателей — без аватарок, только подпись", async () => {
    vi.mocked(fetchPublicMusicRadio).mockResolvedValue(
      makeState({ listeners: 2 }),
    );
    const { container } = render(<PublicRadio manifest={null} showTelegram />);

    expect(
      await screen.findByText("Сейчас слушают 2 человека"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("img[src^='https://a/']")).toHaveLength(
      0,
    );
    expect(screen.getByRole("link", { name: /Telegram/ })).toBeInTheDocument();
  });

  it("недавно в эфире, прогресс, «Поделиться» и точки баннера", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPublicMusicRadio).mockResolvedValue(makeState());
    render(<PublicRadio manifest={null} showTelegram={false} />);

    expect(await screen.findByText("Нрисимха кавача")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "В медиатеке" })).toHaveAttribute(
      "href",
      "/music/tracks/track-0",
    );
    expect(
      screen.getByRole("progressbar", { name: "Сколько отзвучало из записи" }),
    ).toHaveAttribute("aria-valuenow", "3");
    expect(
      screen.getByRole("button", { name: "Поделиться эфиром" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Установить приложение" }),
    ).toHaveAttribute("href", "#install");
    // VED-651: приглашение в тур — с переливом.
    const invite = screen.getByRole("link", {
      name: "Познакомиться с VedaMatch",
    });
    expect(invite).toHaveAttribute("href", "/tour");
    expect(invite).toHaveClass("vm-invite");

    const dots = screen.getAllByRole("button", { name: /^Баннер \d/ });
    expect(dots.length).toBeGreaterThan(1);
    await user.click(dots[1]);
    expect(dots[1]).toHaveAttribute("aria-current", "true");
  });

  it("запись по ссылке «Поделиться» — отдельной карточкой над эфиром (VED-661)", async () => {
    vi.mocked(fetchPublicMusicRadio).mockResolvedValue(makeState());
    vi.mocked(fetchPublicSharedTrack).mockResolvedValue({
      track: {
        id: "t9",
        title: "Шикшаштака",
        artist: { name: "Мантры" },
        coverUrl: null,
      } as never,
      streamUrl: "https://s/t9.mp3",
    });
    render(
      <PublicRadio manifest={null} showTelegram={false} sharedTrackId="t9" />,
    );

    expect(await screen.findByText("Вам прислали запись")).toBeInTheDocument();
    expect(screen.getByText("Шикшаштака")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Слушать «Шикшаштака»" }),
    ).toBeEnabled();
    expect(fetchPublicSharedTrack).toHaveBeenCalledWith("t9");
  });
});
