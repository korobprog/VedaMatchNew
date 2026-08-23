import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatConversationDetail } from "@vedamatch/shared";
import { ChatRoomMenu } from "./chat-room-menu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/chat-client", () => ({
  deleteChatConversation: vi.fn(),
  leaveChatConversation: vi.fn(),
  reportChat: vi.fn(),
  setChatMuted: vi.fn(),
  setChatPinned: vi.fn(),
  subscribeToChannel: vi.fn(),
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

import { setConversationTheme } from "@/lib/chat-appearance-api";

const conversation = {
  id: "conv-1",
  kind: "direct",
  myRole: "member",
  membersCount: 2,
  muted: false,
  pinned: false,
} as unknown as ChatConversationDetail;

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
});
