import { describe, expect, it } from "vitest";
import type {
  ChatConversationSummary,
  ChatMessageDto,
} from "@vedamatch/shared";
import { chatListPreview } from "./chat-list-preview";

function message(overrides: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: "m-1",
    conversationId: "c-1",
    author: { id: "u-2", name: "Радха", avatarUrl: null, lastSeenAt: null },
    body: "Харе Кришна",
    attachments: [],
    reactions: [],
    createdAt: "2026-09-21T10:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    mine: false,
    readByAll: false,
    ...overrides,
  } as ChatMessageDto;
}

function conversation(
  overrides: Partial<ChatConversationSummary> = {},
): ChatConversationSummary {
  return {
    id: "c-1",
    kind: "group",
    state: "active",
    visibility: "private",
    title: "Вайшнавы Москвы",
    membersCount: 4,
    unreadCount: 0,
    muted: false,
    pinned: false,
    official: false,
    canWrite: true,
    lastMessage: message(),
    lastMessageAt: "2026-09-21T10:00:00.000Z",
    activeGroupCallId: null,
    ...overrides,
  } as ChatConversationSummary;
}

describe("вторая строка беседы в списке", () => {
  it("идущий звонок вытесняет последнее сообщение", () => {
    // Сообщение подождёт, разговор идёт сейчас.
    expect(chatListPreview(conversation({ activeGroupCallId: "room-1" }))).toEqual(
      { text: "Идёт групповой звонок", live: true },
    );
  });

  it("звонок важнее даже свежего сообщения", () => {
    expect(
      chatListPreview(
        conversation({
          activeGroupCallId: "room-1",
          lastMessage: message({ body: "только что написал" }),
        }),
      ).live,
    ).toBe(true);
  });

  it("без звонка показывает сообщение с именем автора", () => {
    expect(chatListPreview(conversation())).toEqual({
      text: "Радха: Харе Кришна",
      live: false,
    });
  });

  it("в личном диалоге имя автора не повторяет заголовок", () => {
    expect(chatListPreview(conversation({ kind: "direct" })).text).toBe(
      "Харе Кришна",
    );
  });

  it("закончившийся звонок строку не занимает", () => {
    // Сервер отдаёт null, как только в комнате не осталось живых.
    expect(chatListPreview(conversation({ activeGroupCallId: null })).live).toBe(
      false,
    );
  });

  it("поля нет вовсе (старый ответ API) — ведёт себя как «звонка нет»", () => {
    const stale = conversation();
    delete (stale as { activeGroupCallId?: unknown }).activeGroupCallId;
    expect(chatListPreview(stale).live).toBe(false);
  });

  it("пустая беседа говорит об этом прямо", () => {
    expect(chatListPreview(conversation({ lastMessage: null })).text).toBe(
      "Пока ни одного сообщения",
    );
  });

  it("удалённое сообщение не показывает своего текста", () => {
    expect(
      chatListPreview(
        conversation({
          lastMessage: message({
            body: "секрет",
            deletedAt: "2026-09-21T10:01:00.000Z",
          }),
        }),
      ).text,
    ).toBe("Сообщение удалено");
  });

  it("вложение называется видом, а не пустотой", () => {
    expect(
      chatListPreview(
        conversation({
          lastMessage: message({
            body: "",
            attachments: [{ id: "a-1", kind: "voice", url: "/a" }],
          }),
        }),
      ).text,
    ).toBe("Радха: Голосовое сообщение");
  });
});
