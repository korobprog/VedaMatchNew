import { describe, expect, it } from "vitest";
import type { ChatCallSignal } from "@vedamatch/shared";
import {
  buildMediaSignal,
  DEFAULT_REMOTE_MEDIA,
  readMediaSignal,
  shouldAnnounceMedia,
} from "./media-state-signal";

/**
 * Сигнал «камера сейчас снимает» — единственное, что не даёт свернувшему
 * вкладку соседу показывать остальным замёрзший кадр: место под видео
 * сервер за ним держит, а кадры идти перестали.
 */

describe("сборка и разбор", () => {
  it("состояние ходит туда и обратно без потерь", () => {
    expect(readMediaSignal(buildMediaSignal(false))).toEqual({ video: false });
    expect(readMediaSignal(buildMediaSignal(true))).toEqual({ video: true });
  });

  it("offer и кандидат — не про медиа", () => {
    const offer: ChatCallSignal = {
      kind: "sdp",
      sdp: { type: "offer", sdp: "v=0…" },
    };
    expect(readMediaSignal(offer)).toBeNull();
    expect(readMediaSignal({ kind: "candidate", candidate: null })).toBeNull();
  });

  it("испорченная форма игнорируется, а не гасит живое видео", () => {
    // Подставить `false` здесь значило бы дать чужому мусору погасить
    // картинку собеседника.
    const broken = [
      { kind: "media" },
      { kind: "media", media: null },
      { kind: "media", media: {} },
      { kind: "media", media: { video: "да" } },
    ] as unknown as ChatCallSignal[];
    for (const signal of broken) expect(readMediaSignal(signal)).toBeNull();
  });

  it("молчание означает «камера снимает»", () => {
    expect(DEFAULT_REMOTE_MEDIA.video).toBe(true);
  });
});

describe("когда слать", () => {
  it("изменившееся состояние — слать", () => {
    expect(shouldAnnounceMedia(true, false)).toBe(true);
    expect(shouldAnnounceMedia(false, true)).toBe(true);
  });

  it("то же состояние второй раз — не слать", () => {
    // В mesh'е каждый сигнал уходит троим и стоит трёх запросов с
    // ретраями; дребезг кнопки не должен превращаться в очередь.
    expect(shouldAnnounceMedia(true, true)).toBe(false);
    expect(shouldAnnounceMedia(false, false)).toBe(false);
  });

  it("после восстановления связи состояние повторяется заново", () => {
    // Провайдер сбрасывает отметку в `null` на каждом `connected`.
    expect(shouldAnnounceMedia(null, true)).toBe(true);
    expect(shouldAnnounceMedia(null, false)).toBe(true);
  });
});
