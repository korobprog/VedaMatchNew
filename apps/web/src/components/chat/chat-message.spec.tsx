import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessageDto } from "@vedamatch/shared";
import { ChatMessage } from "./chat-message";

function message(over: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: "m-1",
    conversationId: "c-1",
    author: { id: "user-2", name: "Мадхава" } as ChatMessageDto["author"],
    body: "Харе Кришна",
    attachments: [],
    reactions: [],
    createdAt: "2026-09-05T10:00:00.000Z",
    ...over,
  };
}

function setup(over: Partial<ChatMessageDto> = {}, props = {}) {
  const onReply = vi.fn();
  render(
    <ChatMessage
      message={message(over)}
      mine={false}
      showAuthor={false}
      canPin={false}
      pinned={false}
      onReply={onReply}
      onReact={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onReport={vi.fn()}
      onPin={vi.fn()}
      {...props}
    />,
  );
  return { onReply };
}

describe("ChatMessage", () => {
  it("текст сообщения — не кнопка: его можно выделить и прочитать", () => {
    setup();

    // Раньше пузырь был `role="button"`, и скринридер читал каждое сообщение
    // как «кнопка, Действия с сообщением».
    expect(
      screen.queryByRole("button", { name: "Действия с сообщением" })?.textContent,
    ).not.toContain("Харе Кришна");
    expect(screen.getByText("Харе Кришна").closest("[role=button]")).toBeNull();
  });

  it("панель действий открывает отдельная кнопка", async () => {
    const user = userEvent.setup();
    const { onReply } = setup();

    await user.click(screen.getByRole("button", { name: "Действия с сообщением" }));
    await user.click(screen.getByRole("button", { name: "Ответить" }));

    expect(onReply).toHaveBeenCalled();
  });

  it("копирует текст сообщения", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "Действия с сообщением" }));
    await user.click(screen.getByRole("button", { name: "Копировать" }));

    expect(await navigator.clipboard.readText()).toBe("Харе Кришна");
    expect(
      await screen.findByRole("button", { name: "Скопировано" }),
    ).toBeInTheDocument();
  });

  it("у сообщения без текста копировать нечего", async () => {
    const user = userEvent.setup();
    setup({ body: "", attachments: [{ id: "a1", kind: "voice" }] });

    await user.click(screen.getByRole("button", { name: "Действия с сообщением" }));

    expect(
      screen.queryByRole("button", { name: "Копировать" }),
    ).not.toBeInTheDocument();
  });

  it("ещё не доехавшее говорит об этом вместо времени", () => {
    setup({}, { mine: true, pending: true });

    expect(screen.getByText("отправляется…")).toBeInTheDocument();
    // Прочитать его ещё не могли: оно не доехало.
    expect(screen.queryByLabelText(/Прочитано/)).not.toBeInTheDocument();
  });

  it("у удалённого сообщения действий нет вовсе", () => {
    setup({ deletedAt: "2026-09-05T10:05:00.000Z" });

    expect(
      screen.queryByRole("button", { name: "Действия с сообщением" }),
    ).not.toBeInTheDocument();
  });
});
