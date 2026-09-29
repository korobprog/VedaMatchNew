import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MusicRadioPublicStateDto } from "@vedamatch/shared";
import { fetchPublicMusicRadio } from "@/lib/music-radio-client";
import { PublicRadio } from "./public-radio";

vi.mock("@/lib/music-radio-client", () => ({
  fetchPublicMusicRadio: vi.fn(),
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
});
