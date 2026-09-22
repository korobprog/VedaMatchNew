import { describe, expect, it } from "vitest";
import type { ChatGroupCallDto } from "@vedamatch/shared";
import { groupCallBannerLabel, peopleLabel } from "./group-call-banner-text";

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

describe("плашка группового звонка", () => {
  it("свой звонок ведёт назад к панели, а не предлагает войти заново", () => {
    const banner = groupCallBannerLabel(room(["a", "me"]), room(["a", "me"]), "me");
    expect(banner).toEqual({
      kind: "own",
      callId: "room-1",
      title: "Групповой звонок · 2 человека",
      action: "Вернуться",
      blocked: false,
    });
  });

  it("чужой звонок в открытой беседе предлагает войти", () => {
    const banner = groupCallBannerLabel(null, room(["a", "b"]), "me");
    expect(banner).toMatchObject({
      kind: "invite",
      action: "Войти",
      blocked: false,
    });
    expect(banner?.title).toBe("Идёт звонок · 2 человека");
  });

  it("полная комната объясняет, почему войти нельзя, и гасит кнопку", () => {
    const banner = groupCallBannerLabel(null, room(["a", "b", "c", "d"]), "me");
    expect(banner?.action).toBe("В звонке уже 4 человека");
    expect(banner?.blocked).toBe(true);
  });

  it("мы уже числимся в комнате — плашка молчит, вход доводит провайдер", () => {
    expect(groupCallBannerLabel(null, room(["a", "me"]), "me")).toBeNull();
  });

  it("закончившийся и отсутствующий звонок плашки не дают", () => {
    expect(
      groupCallBannerLabel(null, room(["a"], { status: "ended" }), "me"),
    ).toBeNull();
    expect(groupCallBannerLabel(null, null, "me")).toBeNull();
  });

  it("склоняет «человек»", () => {
    expect(peopleLabel(1)).toBe("1 человек");
    expect(peopleLabel(2)).toBe("2 человека");
    expect(peopleLabel(5)).toBe("5 человек");
    expect(peopleLabel(11)).toBe("11 человек");
    expect(peopleLabel(22)).toBe("22 человека");
  });
});
