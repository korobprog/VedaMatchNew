import { describe, expect, it } from "vitest";
import type {
  ChatGroupCallDto,
  ChatGroupCallParticipantDto,
} from "@vedamatch/shared";
import {
  canJoin,
  IDLE_GROUP_CALL_STATE,
  joinBlockedReason,
  peerStateLabel,
  reduceGroupCall,
  type GroupCallState,
} from "./group-call-state";

function participant(id: string, minute: number): ChatGroupCallParticipantDto {
  return {
    user: { id, name: id, avatarUrl: null, lastSeenAt: null },
    joinedAt: `2026-09-21T10:0${minute}:00.000Z`,
    muted: false,
    host: minute === 0,
  };
}

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
    participants: ids.map((id, index) => participant(id, index)),
    maxParticipants: 4,
    ...over,
  };
}

function joined(ids: string[]): GroupCallState {
  return reduceGroupCall(IDLE_GROUP_CALL_STATE, {
    type: "joined",
    call: room(ids),
    at: 1000,
  });
}

describe("вход в комнату", () => {
  it("вход ставит фазу, комнату и время", () => {
    const state = joined(["a", "me"]);
    expect(state.phase).toBe("active");
    expect(state.joinedAt).toBe(1000);
    expect(state.call?.participants).toHaveLength(2);
  });

  it("повторный ответ сервера не сбрасывает таймер разговора", () => {
    const state = reduceGroupCall(joined(["a", "me"]), {
      type: "joined",
      call: room(["a", "me", "b"]),
      at: 9999,
    });
    expect(state.joinedAt).toBe(1000);
  });

  it("восстановление после перезагрузки вкладки поднимает соединения заново", () => {
    const withPeers = reduceGroupCall(joined(["a", "me"]), {
      type: "peer-state",
      userId: "a",
      state: "connected",
    });
    const restored = reduceGroupCall(withPeers, {
      type: "restore",
      call: room(["a", "me"]),
      at: 5000,
    });
    expect(restored.peerStates).toEqual({});
    expect(restored.phase).toBe("active");
  });

  it("«входим» из простоя обнуляет прежнюю ошибку", () => {
    const failed = reduceGroupCall(joined(["a", "me"]), {
      type: "failed",
      error: "В звонке уже 4 человека",
    });
    expect(reduceGroupCall(failed, { type: "joining" })).toEqual({
      ...IDLE_GROUP_CALL_STATE,
      phase: "joining",
    });
  });
});

describe("состав комнаты меняется по ходу", () => {
  it("вошедший появляется в составе", () => {
    const state = reduceGroupCall(joined(["a", "me"]), {
      type: "stream",
      event: { type: "group-call.updated", call: room(["a", "me", "b"]) },
      selfId: "me",
    });
    expect(state.call?.participants.map((p) => p.user.id)).toEqual([
      "a",
      "me",
      "b",
    ]);
  });

  it("вышедший уносит с собой состояние своего соединения и подпись «говорит»", () => {
    let state = joined(["a", "me", "b"]);
    state = reduceGroupCall(state, {
      type: "peer-state",
      userId: "a",
      state: "connected",
    });
    state = reduceGroupCall(state, {
      type: "peer-state",
      userId: "b",
      state: "connecting",
    });
    state = reduceGroupCall(state, { type: "speaking", userIds: ["a", "b"] });

    const after = reduceGroupCall(state, {
      type: "stream",
      event: { type: "group-call.updated", call: room(["a", "me"]) },
      selfId: "me",
    });
    expect(after.peerStates).toEqual({ a: "connected" });
    expect(after.speaking).toEqual(["a"]);
  });

  it("нас убрали из комнаты — это финал, а не пустой список собеседников", () => {
    const after = reduceGroupCall(joined(["a", "me"]), {
      type: "stream",
      event: { type: "group-call.updated", call: room(["a"]) },
      selfId: "me",
    });
    expect(after.phase).toBe("ended");
  });

  it("комнату закрыли — финал", () => {
    const after = reduceGroupCall(joined(["a", "me"]), {
      type: "stream",
      event: {
        type: "group-call.ended",
        call: room(["a", "me"], { status: "ended", hostId: null }),
      },
      selfId: "me",
    });
    expect(after.phase).toBe("ended");
    expect(after.peerStates).toEqual({});
  });

  it("события чужой комнаты игнорируются", () => {
    const state = joined(["a", "me"]);
    const after = reduceGroupCall(state, {
      type: "stream",
      event: {
        type: "group-call.updated",
        call: room(["x", "y"], { id: "room-2" }),
      },
      selfId: "me",
    });
    expect(after).toBe(state);
  });

  it("сигналинг состояние панели не трогает", () => {
    const state = joined(["a", "me"]);
    const after = reduceGroupCall(state, {
      type: "stream",
      event: {
        type: "group-call.signal",
        callId: "room-1",
        fromUserId: "a",
        signal: { kind: "candidate", candidate: null },
      },
      selfId: "me",
    });
    expect(after).toBe(state);
  });
});

describe("микрофон и выход", () => {
  it("переключатель микрофона работает сразу, не дожидаясь сервера", () => {
    const muted = reduceGroupCall(joined(["a", "me"]), { type: "toggle-mute" });
    expect(muted.muted).toBe(true);
    expect(reduceGroupCall(muted, { type: "toggle-mute" }).muted).toBe(false);
  });

  it("сервер может поправить состояние микрофона", () => {
    const state = reduceGroupCall(joined(["a", "me"]), {
      type: "muted",
      muted: true,
    });
    expect(state.muted).toBe(true);
  });

  it("выключенный микрофон остаётся выключенным, когда состав сменился", () => {
    const muted = reduceGroupCall(joined(["a", "me"]), { type: "toggle-mute" });
    const after = reduceGroupCall(muted, {
      type: "stream",
      event: { type: "group-call.updated", call: room(["a", "me", "b"]) },
      selfId: "me",
    });
    expect(after.muted).toBe(true);
  });

  it("вышли сами — фаза «завершено», соединения сброшены", () => {
    let state = joined(["a", "me"]);
    state = reduceGroupCall(state, {
      type: "peer-state",
      userId: "a",
      state: "connected",
    });
    const after = reduceGroupCall(state, { type: "left" });
    expect(after.phase).toBe("ended");
    expect(after.peerStates).toEqual({});
  });

  it("из простоя «вышли» ничего не ломает", () => {
    expect(reduceGroupCall(IDLE_GROUP_CALL_STATE, { type: "left" })).toBe(
      IDLE_GROUP_CALL_STATE,
    );
  });

  it("ошибка завершает звонок и остаётся видна", () => {
    const after = reduceGroupCall(joined(["a", "me"]), {
      type: "failed",
      error: "Нет доступа к микрофону",
    });
    expect(after.phase).toBe("ended");
    expect(after.error).toBe("Нет доступа к микрофону");
  });

  it("закрытие итога возвращает в простой", () => {
    const ended = reduceGroupCall(joined(["a", "me"]), { type: "left" });
    expect(reduceGroupCall(ended, { type: "reset" })).toBe(
      IDLE_GROUP_CALL_STATE,
    );
  });
});

describe("состояние отдельного соединения", () => {
  it("не пишется, когда мы не в звонке", () => {
    const after = reduceGroupCall(IDLE_GROUP_CALL_STATE, {
      type: "peer-state",
      userId: "a",
      state: "connected",
    });
    expect(after.peerStates).toEqual({});
  });

  it("обрыв связи с одним собеседником не выкидывает нас из комнаты", () => {
    const after = reduceGroupCall(joined(["a", "me", "b"]), {
      type: "peer-state",
      userId: "a",
      state: "failed",
    });
    expect(after.phase).toBe("active");
    expect(peerStateLabel(after.peerStates.a)).toBe("Нет связи");
  });

  it("подпись молчит, когда всё хорошо", () => {
    expect(peerStateLabel("connected")).toBeNull();
    expect(peerStateLabel(undefined)).toBeNull();
    expect(peerStateLabel("connecting")).toBe("Соединяемся…");
    expect(peerStateLabel("reconnecting")).toBe("Связь пропала…");
    expect(peerStateLabel("failed")).toBe("Нет связи");
  });

  it("одинаковый список говорящих не создаёт нового состояния", () => {
    const state = reduceGroupCall(joined(["a", "me"]), {
      type: "speaking",
      userIds: ["a"],
    });
    expect(reduceGroupCall(state, { type: "speaking", userIds: ["a"] })).toBe(
      state,
    );
  });
});

describe("можно ли войти", () => {
  it("в полную комнату не пускает", () => {
    const full = room(["a", "b", "c", "d"]);
    expect(canJoin(full)).toBe(false);
    expect(joinBlockedReason(full)).toBe("В звонке уже 4 человека");
  });

  it("в комнату с местом — пускает", () => {
    expect(canJoin(room(["a", "b", "c"]))).toBe(true);
    expect(joinBlockedReason(room(["a"]))).toBeNull();
  });

  it("потолок берётся из ответа сервера, а не из числа в коде", () => {
    const wider = room(["a", "b", "c", "d"], { maxParticipants: 6 });
    expect(canJoin(wider)).toBe(true);
    expect(joinBlockedReason(wider)).toBeNull();
  });

  it("в закрытую и в несуществующую — нет", () => {
    expect(canJoin(room(["a"], { status: "ended" }))).toBe(false);
    expect(joinBlockedReason(null)).toBe("Звонок уже закончился");
  });
});
