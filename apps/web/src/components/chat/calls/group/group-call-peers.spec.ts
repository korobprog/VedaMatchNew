import { describe, expect, it } from "vitest";
import type {
  ChatGroupCallDto,
  ChatGroupCallParticipantDto,
} from "@vedamatch/shared";
import { ownConnectionCount, participantOf, planPeers } from "./group-call-peers";

function participant(id: string, minute: number): ChatGroupCallParticipantDto {
  return {
    user: { id, name: id, avatarUrl: null, lastSeenAt: null },
    joinedAt: `2026-09-21T10:0${minute}:00.000Z`,
    muted: false,
    host: false,
  };
}

function call(
  ...people: ChatGroupCallParticipantDto[]
): Pick<ChatGroupCallDto, "participants"> {
  return { participants: people };
}

describe("план соединений mesh", () => {
  it("позже вошедший шлёт offer всем, кто был раньше", () => {
    const room = call(participant("a", 0), participant("b", 1), participant("c", 2));
    expect(planPeers(room, "c").offerTo).toEqual(["a", "b"]);
    expect(planPeers(room, "b").offerTo).toEqual(["a"]);
    expect(planPeers(room, "a").offerTo).toEqual([]);
  });

  it("в каждой паре offer шлёт ровно один — glare невозможен", () => {
    const room = call(
      participant("a", 0),
      participant("b", 1),
      participant("c", 2),
      participant("d", 3),
    );
    const ids = ["a", "b", "c", "d"];
    for (const one of ids)
      for (const other of ids) {
        if (one === other) continue;
        const oneOffers = planPeers(room, one).offerTo.includes(other);
        const otherOffers = planPeers(room, other).offerTo.includes(one);
        expect(oneOffers !== otherOffers).toBe(true);
      }
  });

  it("держим соединение со всеми, кроме себя", () => {
    const room = call(participant("a", 0), participant("b", 1), participant("c", 2));
    expect(planPeers(room, "b").peers).toEqual(["a", "c"]);
  });

  it("вошедший — в `added`, вышедший — в `gone`", () => {
    const room = call(participant("a", 0), participant("b", 1), participant("c", 2));
    const plan = planPeers(room, "a", ["b", "z"]);
    expect(plan.added).toEqual(["c"]);
    expect(plan.gone).toEqual(["z"]);
  });

  it("нас в комнате нет — все прежние соединения на закрытие", () => {
    const plan = planPeers(call(participant("a", 0)), "me", ["a", "b"]);
    expect(plan).toEqual({ peers: [], offerTo: [], gone: ["a", "b"], added: [] });
  });

  it("одинаковое время входа разводится по id — порядок не зависит от сервера", () => {
    const room = call(participant("b", 0), participant("a", 0));
    expect(planPeers(room, "b").offerTo).toEqual(["a"]);
    expect(planPeers(room, "a").offerTo).toEqual([]);
  });

  it("вкладка держит на одно соединение меньше, чем людей в комнате", () => {
    expect(ownConnectionCount(1)).toBe(0);
    expect(ownConnectionCount(4)).toBe(3);
    expect(ownConnectionCount(0)).toBe(0);
  });

  it("находит участника по id и молчит про чужого", () => {
    const room = call(participant("a", 0));
    expect(participantOf(room, "a")?.user.id).toBe("a");
    expect(participantOf(room, "z")).toBeNull();
  });
});
