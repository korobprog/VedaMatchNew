import { describe, expect, it } from "vitest";
import {
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  formatVideoDuration,
  videoDurationProblem,
  videoFileProblem,
} from "./video-file";

describe("videoFileProblem", () => {
  it("пропускает mp4, webm и mov", () => {
    for (const type of ["video/mp4", "video/webm", "video/quicktime"])
      expect(videoFileProblem({ name: "a", type, size: 10 })).toBeNull();
  });

  it("mov без типа узнаёт по расширению", () => {
    expect(
      videoFileProblem({ name: "IMG_01.MOV", type: "", size: 10 }),
    ).toBeNull();
    expect(videoFileProblem({ name: "notes.txt", type: "", size: 10 })).toMatch(
      /mp4/,
    );
  });

  it("картинку, пустой и большой файл отбивает", () => {
    expect(
      videoFileProblem({ name: "a.png", type: "image/png", size: 10 }),
    ).toMatch(/видеофайл/);
    expect(
      videoFileProblem({ name: "a.mp4", type: "video/mp4", size: 0 }),
    ).toBe("Файл пустой");
    expect(
      videoFileProblem({
        name: "a.mp4",
        type: "video/mp4",
        size: VIDEO_MAX_BYTES + 1,
      }),
    ).toMatch(/50 МБ/);
  });
});

describe("videoDurationProblem", () => {
  it("короткий проходит, длинный — нет", () => {
    expect(videoDurationProblem(30)).toBeNull();
    expect(videoDurationProblem(VIDEO_MAX_SECONDS + 5)).toMatch(/длиннее/);
  });

  it("непрочитанная длительность — не отказ, решит сервер", () => {
    expect(videoDurationProblem(Number.NaN)).toBeNull();
    expect(videoDurationProblem(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("formatVideoDuration", () => {
  it("минуты и секунды с нулём", () => {
    expect(formatVideoDuration(7)).toBe("0:07");
    expect(formatVideoDuration(90)).toBe("1:30");
    expect(formatVideoDuration(-1)).toBe("0:00");
  });
});
