import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatConversationDetail,
  ChatMessageDto,
} from "@vedamatch/shared";
import {
  createChatConversation,
  fetchDirectChat,
  sendChatMessage,
} from "@/lib/chat-client";
import { PersonalMiniChat } from "./personal-mini-chat";

vi.mock("@/lib/chat-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chat-client")>()),
  createChatConversation: vi.fn(),
  fetchDirectChat: vi.fn(),
  sendChatMessage: vi.fn(),
}));

const companion = { id: "u2", name: "Санкаршана дас" };

function makeMessage(overrides: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: "m1",
    conversationId: "c1",
    author: { id: "u2", name: "Санкаршана дас", avatarUrl: null },
    body: "Джая Радхе!",
    attachments: [],
    reactions: [],
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  } as ChatMessageDto;
}

function makeChat(
  overrides: Partial<ChatConversationDetail> = {},
): ChatConversationDetail {
  return {
    id: "c1",
    kind: "direct",
    state: "active",
    visibility: "private",
    title: "Санкаршана дас",
    companion,
    membersCount: 2,
    unreadCount: 0,
    muted: false,
    pinned: false,
    official: false,
    canWrite: true,
    lastMessage: null,
    members: [],
    messages: [],
    hasMore: false,
    myRole: "member",
    isConference: false,
    ...overrides,
  } as ChatConversationDetail;
}

// VED-686: миниатюра мессенджера прямо на личной странице.
describe("PersonalMiniChat", () => {
  beforeEach(() => {
    vi.mocked(createChatConversation).mockReset();
    vi.mocked(sendChatMessage).mockReset();
    vi.mocked(fetchDirectChat).mockReset();
    vi.mocked(fetchDirectChat).mockResolvedValue(null);
  });

  it("без переписки объясняет запрос и ведёт в мессенджер", () => {
    render(
      <PersonalMiniChat initial={null} companion={companion} viewerId="u1" />,
    );
    expect(
      screen.getByText(/Переписки пока нет\. Напишите —/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Открыть мессенджер" }),
    ).toHaveAttribute("href", "/chat/with/u2");
  });

  it("показывает последние сообщения переписки", () => {
    render(
      <PersonalMiniChat
        initial={makeChat({
          messages: [makeMessage(), makeMessage({ id: "m2", body: "Как дела?" })],
        })}
        companion={companion}
        viewerId="u1"
      />,
    );
    expect(screen.getByText("Джая Радхе!")).toBeInTheDocument();
    expect(screen.getByText("Как дела?")).toBeInTheDocument();
  });

  it("первое сообщение заводит диалог и становится запросом", async () => {
    const user = userEvent.setup();
    vi.mocked(createChatConversation).mockResolvedValue(
      makeChat({ state: "request", canWrite: true }) as never,
    );
    vi.mocked(sendChatMessage).mockResolvedValue(
      makeMessage({ id: "m1", author: { id: "u1", name: "Вы" }, body: "Намасте" }),
    );
    render(
      <PersonalMiniChat initial={null} companion={companion} viewerId="u1" />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Сообщение" }),
      "Намасте",
    );
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() =>
      expect(sendChatMessage).toHaveBeenCalledWith("c1", { body: "Намасте" }),
    );
    expect(createChatConversation).toHaveBeenCalledWith({
      kind: "direct",
      userId: "u2",
    });
    expect(await screen.findByText("Намасте")).toBeInTheDocument();
    // Запрос пишется один раз — поле закрывается до ответа собеседника.
    expect(
      await screen.findByText("Запрос отправлен — дождитесь ответа"),
    ).toBeInTheDocument();
  });

  it("в существующей переписке отправляет без создания диалога", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChatMessage).mockResolvedValue(
      makeMessage({ id: "m2", author: { id: "u1", name: "Вы" }, body: "Ответ" }),
    );
    render(
      <PersonalMiniChat
        initial={makeChat({ messages: [makeMessage()] })}
        companion={companion}
        viewerId="u1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Сообщение" }), "Ответ");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() =>
      expect(sendChatMessage).toHaveBeenCalledWith("c1", { body: "Ответ" }),
    );
    expect(createChatConversation).not.toHaveBeenCalled();
  });

  it("мой ждущий ответа запрос закрывает поле ввода", () => {
    render(
      <PersonalMiniChat
        initial={makeChat({
          state: "request",
          canWrite: false,
          messages: [makeMessage({ author: { id: "u1", name: "Вы" } })],
        })}
        companion={companion}
        viewerId="u1"
      />,
    );
    expect(
      screen.getByText("Запрос отправлен — дождитесь ответа"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("чужой запрос зовёт ответить в мессенджере", () => {
    render(
      <PersonalMiniChat
        initial={makeChat({
          state: "request",
          canWrite: false,
          messages: [makeMessage()],
        })}
        companion={companion}
        viewerId="u1"
      />,
    );
    expect(
      screen.getByText("Санкаршана дас ждёт вашего ответа — ответьте в мессенджере"),
    ).toBeInTheDocument();
  });

  it("отказ сервера показывается словами", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChatMessage).mockRejectedValue(
      new Error("Человек отклонил переписку"),
    );
    render(
      <PersonalMiniChat
        initial={makeChat({ messages: [makeMessage()] })}
        companion={companion}
        viewerId="u1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Сообщение" }), "Ещё");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Человек отклонил переписку",
    );
  });
});
