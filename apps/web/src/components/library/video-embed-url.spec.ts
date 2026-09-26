import { describe, expect, it } from "vitest";
import { videoEmbedUrl } from "@vedamatch/shared";

// Адрес плеера живёт в `packages/shared`, где своего прогона тестов нет;
// проверяем его здесь, рядом с плеером, который его встраивает.
describe("videoEmbedUrl (VED-536)", () => {
  it("YouTube — основной домен и игра на месте, не youtube-nocookie", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1",
    );
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1",
    );
  });

  it("Rutube — как было", () => {
    expect(videoEmbedUrl("https://rutube.ru/video/abcdef123456/")).toBe(
      "https://rutube.ru/play/embed/abcdef123456/",
    );
  });

  it("не видео — встраивать нечего", () => {
    expect(videoEmbedUrl("https://sampradaya.ru/a")).toBeNull();
  });
});
