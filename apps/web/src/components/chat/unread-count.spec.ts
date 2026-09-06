import { describe, expect, it } from "vitest";
import type { ChatMessageDto } from "@vedamatch/shared";
import { nextUnreadCount } from "./unread-count";

/** Сообщение ровно в той форме, в какой оно приходит потоком событий. */
function message(authorId: string): ChatMessageDto {
  return {
    id: "m1",
    conversationId: "c1",
    author: { id: authorId, name: "Кто-то", avatarUrl: null },
    body: "текст",
    attachments: [],
    reactions: [],
    createdAt: new Date().toISOString(),
    replyTo: null,
    readByOthers: false,
  } as ChatMessageDto;
}

describe("nextUnreadCount", () => {
  it("чужое сообщение прибавляет к счётчику", () => {
    expect(nextUnreadCount(2, message("companion"), "viewer")).toBe(3);
  });

  it("своё сообщение счётчик не трогает", () => {
    // Его отправили из этой же вкладки или из соседней — непрочитанным оно
    // не бывает.
    expect(nextUnreadCount(2, message("viewer"), "viewer")).toBe(2);
  });

  it("не смотрит на readByOthers", () => {
    // Прежний признак «своё» опирался на это поле, а сервер присылает его
    // всегда — счётчик не рос ни разу.
    const incoming = { ...message("companion"), readByOthers: true };
    expect(nextUnreadCount(0, incoming as ChatMessageDto, "viewer")).toBe(1);
  });
});
