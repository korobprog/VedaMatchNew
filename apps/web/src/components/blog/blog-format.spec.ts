import { describe, expect, it } from "vitest";
import {
  blogEditedLabel,
  blogFeedCountdown,
  blogPostDate,
} from "./blog-format";

const NOW = new Date("2026-09-21T12:00:00.000Z");

describe("blogPostDate", () => {
  it("shows day, month and time for this year", () => {
    // Часовой пояс машины участвует в результате, поэтому проверяем форму,
    // а не буквальные цифры: дата и время там точно есть, года нет.
    const text = blogPostDate("2026-09-21T09:30:00.000Z", NOW);
    expect(text).toMatch(/^\d{1,2} сентября, \d{2}:\d{2}$/);
  });

  // В ленте, где почти всё свежее, год рядом с каждым постом — шум.
  it("adds the year for an older post and drops the time", () => {
    expect(blogPostDate("2025-01-05T09:30:00.000Z", NOW)).toMatch(
      /^\d{1,2} января 2025$/,
    );
  });

  it("returns an empty string for an unusable date", () => {
    expect(blogPostDate("когда-то", NOW)).toBe("");
  });
});

describe("blogFeedCountdown", () => {
  it("counts whole hours up", () => {
    expect(blogFeedCountdown("2026-09-21T13:30:00.000Z", NOW)).toBe(
      "в ленте ещё 2 часа",
    );
    expect(blogFeedCountdown("2026-09-21T12:00:01.000Z", NOW)).toBe(
      "в ленте ещё 1 час",
    );
  });

  it("switches to days past a day", () => {
    expect(blogFeedCountdown("2026-09-24T12:00:00.000Z", NOW)).toBe(
      "в ленте ещё 3 дня",
    );
    expect(blogFeedCountdown("2026-09-26T12:00:00.000Z", NOW)).toBe(
      "в ленте ещё 5 дней",
    );
  });

  // Ни у бессрочного поста, ни у вышедшего из ленты счётчика быть не должно.
  it("stays silent without a deadline or past it", () => {
    expect(blogFeedCountdown(null, NOW)).toBeNull();
    expect(blogFeedCountdown("2026-09-21T12:00:00.000Z", NOW)).toBeNull();
    expect(blogFeedCountdown("2026-09-20T12:00:00.000Z", NOW)).toBeNull();
    expect(blogFeedCountdown("никогда", NOW)).toBeNull();
  });
});

describe("blogEditedLabel", () => {
  // Правка в день публикации: дата уже стоит рядом, повторять её незачем.
  it("shows only the time when the post was edited the same day", () => {
    const label = blogEditedLabel(
      "2026-09-21T09:40:00.000Z",
      "2026-09-21T09:30:00.000Z",
    );
    expect(label).toMatch(/^изменено в \d{2}:\d{2}$/);
  });

  it("shows the day and month when the edit came later", () => {
    expect(
      blogEditedLabel("2026-09-23T09:40:00.000Z", "2026-09-21T09:30:00.000Z"),
    ).toMatch(/^изменено \d{1,2} сентября$/);
  });

  // Непоправленный пост подписи не получает: «изменено» у каждой карточки
  // ленты — тот самый лишний шум, которого просили избежать.
  it("stays silent for a post nobody edited", () => {
    expect(blogEditedLabel(null, "2026-09-21T09:30:00.000Z")).toBeNull();
    expect(blogEditedLabel("никогда", "2026-09-21T09:30:00.000Z")).toBeNull();
  });
});
