import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessageDto } from "@vedamatch/shared";
vi.mock("@/lib/chat-client", () => ({
  uploadChatFile: vi.fn().mockResolvedValue({
    kind: "image",
    url: "https://cdn/x.png",
    key: "chat/x.png",
    mimeType: "image/png",
    sizeBytes: 1,
    width: 10,
    height: 10,
  }),
}));

import { ChatComposer } from "./chat-composer";

const message: ChatMessageDto = {
  id: "m1",
  conversationId: "c1",
  author: { id: "u1", name: "Кешава", avatarUrl: null, lastSeenAt: null },
  body: "Как проходит утренняя практика?",
  createdAt: "2026-08-22T10:00:00.000Z",
  editedAt: null,
  deletedAt: null,
  attachments: [],
  reactions: [],
  replyTo: null,
  readByOthers: false,
};

function setup(editing: ChatMessageDto | null) {
  const onSaveEdit = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ChatComposer
      conversationId="c1"
      replyTo={null}
      editing={editing}
      onCancelReply={() => undefined}
      onCancelEdit={() => undefined}
      onSend={vi.fn().mockResolvedValue(undefined)}
      onSaveEdit={onSaveEdit}
      onTyping={() => undefined}
    />,
  );
  return { ...view, onSaveEdit };
}

describe("ChatComposer", () => {
  it("правка начинается с прежнего текста сообщения", () => {
    // Пустое поле означало, что «Сохранить» молча ничего не делает: человек
    // видел полоску правки и ни на что не мог нажать.
    setup(message);

    expect(screen.getByPlaceholderText("Новый текст сообщения")).toHaveValue(
      "Как проходит утренняя практика?",
    );
  });

  it("сохраняет исправленный текст", async () => {
    const { onSaveEdit } = setup(message);

    const field = screen.getByPlaceholderText("Новый текст сообщения");
    await userEvent.clear(field);
    await userEvent.type(field, "Поправленный текст");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSaveEdit).toHaveBeenCalledWith("Поправленный текст");
  });

  it("начатое письмо не теряется, пока правится чужая строка", async () => {
    const { rerender } = setup(null);

    await userEvent.type(
      screen.getByPlaceholderText("Сообщение…"),
      "черновик",
    );

    const props = {
      conversationId: "c1",
      replyTo: null,
      onCancelReply: () => undefined,
      onCancelEdit: () => undefined,
      onSend: vi.fn().mockResolvedValue(undefined),
      onSaveEdit: vi.fn().mockResolvedValue(undefined),
      onTyping: () => undefined,
    };
    rerender(<ChatComposer {...props} editing={message} />);
    expect(screen.getByPlaceholderText("Новый текст сообщения")).toHaveValue(
      "Как проходит утренняя практика?",
    );

    rerender(<ChatComposer {...props} editing={null} />);
    expect(screen.getByPlaceholderText("Сообщение…")).toHaveValue("черновик");
  });
});

describe("ChatComposer — вложения", () => {
  it("с включённой мгновенной отправкой фото уходит сразу, без кнопки", async () => {
    window.localStorage.setItem("vedamatch:chat-instant-media", "1");
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ChatComposer
        conversationId="c1"
        replyTo={null}
        editing={null}
        onCancelReply={() => undefined}
        onCancelEdit={() => undefined}
        onSend={onSend}
        onSaveEdit={vi.fn()}
        onTyping={() => undefined}
      />,
    );
    const input = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "photo.png", { type: "image/png" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0][0]).toBe("");
    expect(onSend.mock.calls[0][1]).toEqual([
      expect.objectContaining({ kind: "image", url: "https://cdn/x.png" }),
    ]);
    expect(screen.queryByText("Фото")).not.toBeInTheDocument();
    window.localStorage.removeItem("vedamatch:chat-instant-media");
  });

  it("по умолчанию фото ложится под поле и ждёт кнопки", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ChatComposer
        conversationId="c1"
        replyTo={null}
        editing={null}
        onCancelReply={() => undefined}
        onCancelEdit={() => undefined}
        onSend={onSend}
        onSaveEdit={vi.fn()}
        onTyping={() => undefined}
      />,
    );
    const input = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "photo.png", { type: "image/png" }));

    expect(await screen.findByText("Фото")).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });
});
