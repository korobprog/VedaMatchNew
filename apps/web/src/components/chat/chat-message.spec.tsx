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
  it("цитата ведёт к сообщению, на которое отвечали", async () => {
    const onJumpToReply = vi.fn();
    setup(
      {
        replyTo: {
          id: "m-0",
          authorName: "Маму Тхакур дас",
          body: "",
          attachmentKind: "image",
        },
      } as Partial<ChatMessageDto>,
      { onJumpToReply },
    );

    // В мессенджерах цитату нажимают именно затем, чтобы увидеть, о чём речь.
    await userEvent.click(
      screen.getByRole("button", {
        name: "Перейти к сообщению: Маму Тхакур дас",
      }),
    );

    expect(onJumpToReply).toHaveBeenCalledWith("m-0");
  });

  it("цитата без текста называет вложение, а не пустоту", () => {
    setup({
      replyTo: {
        id: "m-0",
        authorName: "Маму Тхакур дас",
        body: "",
        attachmentKind: "image",
      },
    } as Partial<ChatMessageDto>);

    expect(screen.getByText("Вложение")).toBeInTheDocument();
  });

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

  // VED-117: как в Telegram — нажатие по сообщению открывает меню списком.
  it("нажатие по сообщению открывает меню: реакции и действия списком", async () => {
    const user = userEvent.setup();
    const { onReply } = setup();

    await user.click(screen.getByText("Харе Кришна"));

    const menu = screen.getByRole("group", { name: "Меню сообщения" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Реакция 🙏" })).toBeInTheDocument();
    // Чужое сообщение: пожаловаться можно, изменить и удалить — нет.
    expect(screen.getByRole("button", { name: "Пожаловаться" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Ответить" }));
    expect(onReply).toHaveBeenCalled();
    // Действие выполнено — меню закрылось.
    expect(screen.queryByRole("group", { name: "Меню сообщения" })).toBeNull();
  });

  it("у своего сообщения в меню «Изменить» и «Удалить»", async () => {
    const user = userEvent.setup();
    setup({}, { mine: true });

    await user.click(screen.getByText("Харе Кришна"));

    expect(screen.getByRole("button", { name: "Изменить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Пожаловаться" })).toBeNull();
  });

  it("нажатие по цитате ведёт к сообщению, а меню не открывает", async () => {
    const user = userEvent.setup();
    const onJumpToReply = vi.fn();
    setup(
      {
        replyTo: { id: "m-0", authorName: "Маму Тхакур дас", body: "Привет" },
      } as Partial<ChatMessageDto>,
      { onJumpToReply },
    );

    await user.click(
      screen.getByRole("button", { name: "Перейти к сообщению: Маму Тхакур дас" }),
    );

    expect(onJumpToReply).toHaveBeenCalledWith("m-0");
    expect(screen.queryByRole("group", { name: "Меню сообщения" })).toBeNull();
  });

  it("закрывается по Escape", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByText("Харе Кришна"));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Меню сообщения" })).toBeNull();
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
