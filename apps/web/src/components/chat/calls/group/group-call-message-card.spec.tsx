import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatAttachmentDto, ChatGroupCallDto } from "@vedamatch/shared";
import { GroupCallsContext, type GroupCallsApi } from "./group-call-context";
import { GroupCallCard } from "./group-call-message-card";
import { GroupCallStrip } from "./group-call-strip";

function room(ids: string[]): ChatGroupCallDto {
  return {
    id: "room-1",
    conversationId: "conv-1",
    kind: "audio",
    status: "live",
    hostId: ids[0] ?? null,
    startedBy: { id: "a", name: "a" },
    createdAt: "2026-09-26T10:00:00.000Z",
    endedAt: null,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    participants: ids.map((id, index) => ({
      user: { id, name: id },
      joinedAt: "2026-09-26T10:00:00.000Z",
      muted: false,
      video: false,
      host: index === 0,
    })),
  };
}

const card: ChatAttachmentDto = {
  id: "att-1",
  kind: "call",
  title: "Групповой звонок",
  subtitle: "Идёт",
  sourceService: "chat-group-call",
  sourceId: "room-1",
  durationSec: null,
};

function api(over: Partial<GroupCallsApi> = {}): GroupCallsApi {
  return {
    state: { phase: "idle", call: null } as unknown as GroupCallsApi["state"],
    selfId: "me",
    expanded: false,
    callInConversation: () => room(["a", "b"]),
    join: vi.fn(() => Promise.resolve()),
    setExpanded: vi.fn(),
    ...over,
  } as GroupCallsApi;
}

function renderWith(value: GroupCallsApi, node: React.ReactNode) {
  return render(
    <GroupCallsContext.Provider value={value}>{node}</GroupCallsContext.Provider>,
  );
}

describe("вход в групповой звонок из беседы", () => {
  it("карточка в ленте входит в ту же комнату, что и плашка", async () => {
    const value = api();
    renderWith(value, <GroupCallCard attachment={card} conversationId="conv-1" />);

    expect(screen.getByText("Звонок начался")).toBeTruthy();
    expect(screen.getByText("Групповой звонок · 2 из 4")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Войти в звонок" }));
    expect(value.join).toHaveBeenCalledWith("room-1");
  });

  it("завершённая карточка — длительность и никакой кнопки", () => {
    renderWith(
      api({ callInConversation: () => null }),
      <GroupCallCard
        attachment={{ ...card, subtitle: "12:05", durationSec: 725 }}
        conversationId="conv-1"
      />,
    );
    expect(screen.getByText("Звонок завершён")).toBeTruthy();
    expect(screen.getByText("Групповой звонок · 12:05")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("полная комната — кнопка «Мест нет» погашена", () => {
    renderWith(
      api({ callInConversation: () => room(["a", "b", "c", "d"]) }),
      <GroupCallCard attachment={card} conversationId="conv-1" />,
    );
    const button = screen.getByRole("button", { name: "Мест нет" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("плашка над перепиской: «Идёт звонок · 2 из 4 · Войти»", async () => {
    const value = api();
    renderWith(value, <GroupCallStrip conversationId="conv-1" />);

    expect(screen.getByRole("status").textContent).toBe("Идёт звонок · 2 из 4");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(value.join).toHaveBeenCalledWith("room-1");
  });

  it("мы в звонке — плашка разворачивает свою панель, а не входит заново", async () => {
    const own = room(["a", "me"]);
    const value = api({
      state: { phase: "active", call: own } as unknown as GroupCallsApi["state"],
      callInConversation: () => own,
    });
    renderWith(value, <GroupCallStrip conversationId="conv-1" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Вернуться в звонок" }),
    );
    expect(value.setExpanded).toHaveBeenCalledWith(true);
    expect(value.join).not.toHaveBeenCalled();
  });
});
