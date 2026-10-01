import { describe, expect, it } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import {
  RADIO_TITLE,
  sharedTrackCardPath,
  sharedTrackMetadata,
  sharedTrackTitle,
} from "./radio-share-meta";

function track(overrides: Partial<MusicTrackDto> = {}): MusicTrackDto {
  return {
    id: "t1",
    title: "Sri Guru-vandana",
    artist: { id: "a1", slug: "krishna-prem", name: "Krishna Prem" },
    artistCredit: null,
    album: null,
    coverUrl: null,
    ...overrides,
  } as MusicTrackDto;
}

/* VED-718: превью «Поделиться» показывает запись, а не портал. */
describe("sharedTrackMetadata", () => {
  it("заголовок — «Название — Исполнитель», без исполнителя — название", () => {
    expect(sharedTrackTitle(track())).toBe("Sri Guru-vandana — Krishna Prem");
    expect(
      sharedTrackTitle(track({ artist: null, artistCredit: null })),
    ).toBe("Sri Guru-vandana");
    expect(sharedTrackTitle(track({ artist: null, artistCredit: "Gaura" }))).toBe(
      "Sri Guru-vandana — Gaura",
    );
  });

  it("название идёт и в <title>: мессенджеры читают и его тоже", () => {
    const meta = sharedTrackMetadata(track());
    // Абсолют — в противовес общему «Радио VedaMatch», который прятал песню.
    expect(meta.title).toEqual({ absolute: "Sri Guru-vandana — Krishna Prem" });
    expect(meta.openGraph?.title).toBe("Sri Guru-vandana — Krishna Prem");
    expect(meta.twitter?.title).toBe("Sri Guru-vandana — Krishna Prem");
  });

  it("у записи с обложкой — её обложка, и только она", () => {
    const meta = sharedTrackMetadata(
      track({ coverUrl: "https://cdn.example.org/t1.jpg" }),
    );
    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example.org/t1.jpg", alt: "Sri Guru-vandana — Krishna Prem" },
    ]);
    expect(meta.twitter?.images).toEqual(["https://cdn.example.org/t1.jpg"]);
  });

  it("без обложки — карточка записи, а не пусто и не картинка портала", () => {
    const meta = sharedTrackMetadata(track());
    expect(meta.openGraph?.images).toEqual([
      {
        url: sharedTrackCardPath("t1"),
        alt: "Sri Guru-vandana — Krishna Prem",
      },
    ]);
    expect(sharedTrackCardPath("t1")).toContain("/radio/og-image?track=t1");
  });

  it("записи нет — картинки нет вовсе: пустой список перекрывает карточку портала", () => {
    const meta = sharedTrackMetadata(null);
    expect(meta.title).toEqual({ absolute: RADIO_TITLE });
    expect(meta.openGraph?.images).toEqual([]);
    expect(meta.twitter?.images).toEqual([]);
  });
});
