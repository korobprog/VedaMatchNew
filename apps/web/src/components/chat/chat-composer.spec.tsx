import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessageDto } from "@vedamatch/shared";
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
