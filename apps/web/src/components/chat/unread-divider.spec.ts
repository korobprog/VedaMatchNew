import { describe, expect, it } from "vitest";
import type { ChatMessageDto } from "@vedamatch/shared";
import { firstUnreadIndex } from "./unread-divider";

function message(
  id: string,
  authorId: string,
  createdAt: string,
): ChatMessageDto {
  return {
    id,
    conversationId: "c-1",
    author: { id: authorId, name: authorId } as ChatMessageDto["author"],
    body: id,
    attachments: [],
    reactions: [],
    createdAt,
  };
}

const feed = [
  message("m1", "other", "2026-09-05T10:00:00.000Z"),
  message("m2", "me", "2026-09-05T10:01:00.000Z"),
  message("m3", "other", "2026-09-05T10:02:00.000Z"),
  message("m4", "other", "2026-09-05T10:03:00.000Z"),
];

describe("firstUnreadIndex", () => {
  it("показывает первое чужое сообщение после отметки", () => {
    expect(firstUnreadIndex(feed, "me", "2026-09-05T10:01:30.000Z")).toBe(2);
  });

  it("своё непрочитанным не считает: его читает собеседник", () => {
    // Отметка стоит до «m2», но «m2» написал сам виджет владелец.
    expect(firstUnreadIndex(feed, "me", "2026-09-05T10:00:30.000Z")).toBe(2);
  });

  it("всё прочитано — черты нет", () => {
    expect(firstUnreadIndex(feed, "me", "2026-09-05T11:00:00.000Z")).toBeNull();
  });

  it("первый заход обходится без черты: она разделяла бы ленту и пустоту", () => {
    expect(firstUnreadIndex(feed, "me", null)).toBeNull();
    expect(firstUnreadIndex(feed, "me", undefined)).toBeNull();
  });

  it("битую отметку не принимает за начало времён", () => {
    expect(firstUnreadIndex(feed, "me", "позавчера")).toBeNull();
  });

  it("пустая переписка не даёт черты", () => {
    expect(firstUnreadIndex([], "me", "2026-09-05T10:00:00.000Z")).toBeNull();
  });
});
