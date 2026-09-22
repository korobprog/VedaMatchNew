import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatConversationDetail } from "@vedamatch/shared";
import { ChatRoomMenu } from "./chat-room-menu";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock("@/lib/chat-client", () => ({
  deleteChatConversation: vi.fn().mockResolvedValue({ ok: true }),
  leaveChatConversation: vi.fn().mockResolvedValue({ ok: true }),
  reportChat: vi.fn().mockResolvedValue({ ok: true }),
  setChatMuted: vi.fn().mockResolvedValue({ muted: true }),
  setChatPinned: vi.fn().mockResolvedValue({ pinned: true }),
  subscribeToChannel: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/chat-appearance-api", () => ({
  listColorTemplates: vi.fn().mockResolvedValue({
    templates: [
      {
        id: "tpl-1",
        name: "Синий",
        bubbleMine: "#23F0C7",
        bubbleTheirs: "#1A1A2E",
        accent: "#5CCCCC",
        background: "#0A0614",
        createdAt: "2026-08-23T10:00:00.000Z",
        updatedAt: "2026-08-23T10:00:00.000Z",
      },
    ],
  }),
  setConversationTheme: vi.fn().mockResolvedValue({ templateId: "tpl-1" }),
}));

import {
  deleteChatConversation,
  leaveChatConversation,
  setChatMuted,
} from "@/lib/chat-client";
import { setConversationTheme } from "@/lib/chat-appearance-api";

const conversation = {
  id: "conv-1",
  kind: "direct",
  myRole: "member",
  membersCount: 2,
  muted: false,
  pinned: false,
} as unknown as ChatConversationDetail;

const ownedGroup = {
  ...conversation,
  kind: "group",
  myRole: "owner",
  membersCount: 5,
} as unknown as ChatConversationDetail;

function renderMenu(detail: ChatConversationDetail = conversation) {
  return render(
    <ChatRoomMenu
      conversation={detail}
      onChange={() => undefined}
      onThemeChange={() => undefined}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatRoomMenu — оформление", () => {
  it("показывает шаблоны и применяет выбранный", async () => {
    const onThemeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatRoomMenu
        conversation={conversation}
        onChange={() => undefined}
        onThemeChange={onThemeChange}
      />,
    );

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Оформление"));
    await user.click(await screen.findByText("Синий"));

    await waitFor(() =>
      expect(setConversationTheme).toHaveBeenCalledWith("conv-1", "tpl-1"),
    );
    expect(onThemeChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tpl-1" }),
    );
  });

  it("при отказе показывает текст ответа и не закрывает панель", async () => {
    vi.mocked(setConversationTheme).mockRejectedValueOnce(
      new Error("Шаблон уже удалён"),
    );
    const onThemeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatRoomMenu
        conversation={conversation}
        onChange={() => undefined}
        onThemeChange={onThemeChange}
      />,
    );

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Оформление"));
    await user.click(await screen.findByText("Синий"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Шаблон уже удалён",
    );
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(screen.getByText("Синий")).toBeEnabled();
  });
});

describe("ChatRoomMenu — выход из беседы", () => {
  it("по успеху уводит в список и закрывает меню", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Убрать из списка"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/chat"));
    expect(screen.queryByText("Убрать из списка")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("при отказе показывает текст ответа, не уводит со страницы и снимает занятость", async () => {
    vi.mocked(leaveChatConversation).mockRejectedValueOnce(
      new Error("Владелец не может покинуть группу"),
    );
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Убрать из списка"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Владелец не может покинуть группу",
    );
    expect(push).not.toHaveBeenCalled();
    // Меню осталось открытым, а пункт снова нажимаем — можно повторить.
    expect(screen.getByText("Убрать из списка")).toBeEnabled();
  });

  it("при сбое сети показывает человеческий текст вместо Failed to fetch", async () => {
    vi.mocked(leaveChatConversation).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Убрать из списка"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Нет связи с сервером");
    expect(alert).not.toHaveTextContent("Failed to fetch");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("ChatRoomMenu — удаление группы", () => {
  it("по успеху уводит в список", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const user = userEvent.setup();
    renderMenu(ownedGroup);

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Удалить группу"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/chat"));
    expect(deleteChatConversation).toHaveBeenCalledWith("conv-1");
  });

  it("при отказе показывает текст ответа и не уводит со страницы", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    vi.mocked(deleteChatConversation).mockRejectedValueOnce(
      new Error("Беседа уже удалена"),
    );
    const user = userEvent.setup();
    renderMenu(ownedGroup);

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Удалить группу"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Беседа уже удалена",
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Удалить группу")).toBeEnabled();
  });
});

describe("ChatRoomMenu — остальные пункты", () => {
  it("отказ «Без звука» тоже виден, а не проглочен", async () => {
    vi.mocked(setChatMuted).mockRejectedValueOnce(new Error("Нет доступа"));
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Без звука"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Нет доступа");
  });

  it("повторное открытие меню убирает прошлую ошибку", async () => {
    vi.mocked(setChatMuted).mockRejectedValueOnce(new Error("Нет доступа"));
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Без звука"));
    await screen.findByRole("alert");

    await user.click(screen.getByLabelText("Меню беседы")); // закрыли
    await user.click(screen.getByLabelText("Меню беседы")); // открыли снова

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
