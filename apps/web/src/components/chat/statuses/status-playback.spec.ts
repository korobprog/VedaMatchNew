import { describe, expect, it } from "vitest";
import type { ChatStatusAuthorDto, ChatStatusDto } from "@vedamatch/shared";
import { firstUnseen, statusDurationMs, stepStatus } from "./status-playback";

const status = (over: Partial<ChatStatusDto> = {}): ChatStatusDto => ({
  id: "s",
  text: "Текст",
  media: null,
  createdAt: "",
  expiresAt: "",
  viewed: false,
  viewCount: null,
  ...over,
});

const author = (count: number, viewed = 0): ChatStatusAuthorDto => ({
  user: { id: "u", name: "У" },
  statuses: Array.from({ length: count }, (_, at) =>
    status({ id: `s${at}`, viewed: at < viewed }),
  ),
  unseen: count - viewed,
});

describe("statusDurationMs (VED-129)", () => {
  it("фото и короткий текст — пять секунд", () => {
    expect(statusDurationMs(status())).toBe(5000);
  });

  it("длинный текст — дольше, но не больше двенадцати секунд", () => {
    expect(statusDurationMs(status({ text: "а".repeat(180) }))).toBe(9000);
    expect(statusDurationMs(status({ text: "а".repeat(700) }))).toBe(12_000);
  });

  it("ролик — сколько длится", () => {
    expect(
      statusDurationMs(
        status({
          media: {
            kind: "video",
            url: "",
            posterUrl: null,
            width: null,
            height: null,
            durationSec: 23,
          },
        }),
      ),
    ).toBe(23_000);
  });
});

describe("stepStatus", () => {
  const authors = [author(2), author(1)];

  it("внутри автора — к следующему статусу", () => {
    expect(stepStatus(authors, { author: 0, status: 0 }, 1)).toEqual({
      author: 0,
      status: 1,
    });
  });

  it("за последним — первый у следующего автора", () => {
    expect(stepStatus(authors, { author: 0, status: 1 }, 1)).toEqual({
      author: 1,
      status: 0,
    });
  });

  it("за самым последним — конец", () => {
    expect(stepStatus(authors, { author: 1, status: 0 }, 1)).toBeNull();
  });

  it("назад от первого — последний у предыдущего автора", () => {
    expect(stepStatus(authors, { author: 1, status: 0 }, -1)).toEqual({
      author: 0,
      status: 1,
    });
    expect(stepStatus(authors, { author: 0, status: 0 }, -1)).toBeNull();
  });

  it("открывается с первого непросмотренного", () => {
    expect(firstUnseen(author(3, 2))).toBe(2);
    expect(firstUnseen(author(2, 2))).toBe(0);
  });
});
