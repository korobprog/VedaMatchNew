import { describe, expect, it } from "vitest";
import type { ChatGroupCallDto } from "@vedamatch/shared";
import { groupCallCardView, isGroupCallCard } from "./group-call-card";

function room(ids: string[], over: Partial<ChatGroupCallDto> = {}): ChatGroupCallDto {
  return {
    id: "room-1",
    conversationId: "conv-1",
    kind: "audio",
    status: "live",
    hostId: ids[0] ?? null,
    startedBy: { id: ids[0] ?? "a", name: "a", avatarUrl: null, lastSeenAt: null },
    createdAt: "2026-09-21T10:00:00.000Z",
    endedAt: null,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    participants: ids.map((id, index) => ({
      user: { id, name: id, avatarUrl: null, lastSeenAt: null },
      joinedAt: `2026-09-21T10:0${index}:00.000Z`,
      muted: false,
      video: false,
      host: index === 0,
    })),
    ...over,
  };
}

const live = { sourceId: "room-1", subtitle: "Идёт", durationSec: null };
const base = { live: null, own: null, selfId: "me", phase: "idle" as const };

describe("карточка группового звонка в ленте", () => {
  it("идущий звонок — «Звонок начался», места и кнопка входа", () => {
    expect(groupCallCardView(live, { ...base, live: room(["a"]) })).toEqual({
      title: "Звонок начался",
      detail: "1 из 4",
      live: true,
      action: { label: "Войти в звонок", kind: "join", blocked: false },
    });
  });

  it("мы в этом звонке — «Вернуться в звонок»", () => {
    const own = room(["a", "me"]);
    expect(
      groupCallCardView(live, { ...base, live: own, own, phase: "active" }).action,
    ).toEqual({ label: "Вернуться в звонок", kind: "return", blocked: false });
  });

  it("полная комната — «Мест нет» вместо кнопки входа", () => {
    expect(
      groupCallCardView(live, { ...base, live: room(["a", "b", "c", "d"]) }).action,
    ).toEqual({ label: "Мест нет", kind: "join", blocked: true });
  });

  it("сервер закрыл карточку — «Звонок завершён» с длительностью и без кнопки", () => {
    expect(
      groupCallCardView(
        { sourceId: "room-1", subtitle: "12:05", durationSec: 725 },
        // Даже если клиент по старой памяти считает комнату живой.
        { ...base, live: room(["a"]) },
      ),
    ).toEqual({ title: "Звонок завершён", detail: "12:05", live: false, action: null });
  });

  it("в беседе уже другая комната — эта завершена, хоть правка и не дошла", () => {
    expect(
      groupCallCardView(live, { ...base, live: room(["a"], { id: "room-2" }) }),
    ).toEqual({ title: "Звонок завершён", detail: null, live: false, action: null });
  });

  it("пока неизвестно, идёт ли звонок, кнопки нет — ни «войти», ни «завершён»", () => {
    expect(groupCallCardView(live, base)).toEqual({
      title: "Звонок начался",
      detail: null,
      live: true,
      action: null,
    });
  });

  it("отличает карточку группового звонка от записи звонка один на один", () => {
    const attachment = {
      id: "att",
      kind: "call" as const,
      sourceService: "chat-group-call",
      sourceId: "room-1",
    };
    expect(isGroupCallCard(attachment)).toBe(true);
    expect(isGroupCallCard({ ...attachment, sourceService: "chat" })).toBe(false);
    expect(isGroupCallCard({ ...attachment, kind: "file" })).toBe(false);
  });
});
