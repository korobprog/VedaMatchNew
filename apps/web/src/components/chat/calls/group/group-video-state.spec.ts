import { describe, expect, it } from "vitest";
import type {
  ChatGroupCallDto,
  ChatGroupCallParticipantDto,
} from "@vedamatch/shared";
import {
  cameraButtonState,
  camerasOn,
  shouldSendGroupVideo,
  videoDimmedByBackground,
  videoTiles,
} from "./group-video-state";

/**
 * Копия спеки приложения (`apps/mobile/src/lib/group-calls/`), кроме
 * «фона»: там свёрнутое приложение, здесь скрытая вкладка. Если правила
 * разъедутся, покраснеет одна из двух.
 */

function participant(id: string, video = false): ChatGroupCallParticipantDto {
  return {
    user: { id, name: id, avatarUrl: null, lastSeenAt: null },
    joinedAt: new Date().toISOString(),
    muted: false,
    video,
    host: false,
  };
}

function call(
  participants: ChatGroupCallParticipantDto[],
  overrides: Partial<ChatGroupCallDto> = {},
): ChatGroupCallDto {
  return {
    id: "room-1",
    conversationId: "conv-1",
    kind: "audio",
    status: "live",
    hostId: participants[0]?.user.id ?? null,
    startedBy: { id: "a", name: "a", avatarUrl: null, lastSeenAt: null },
    createdAt: new Date().toISOString(),
    endedAt: null,
    participants,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    ...overrides,
  };
}

describe("камера в скрытой вкладке", () => {
  it("вкладку увели — камера гаснет", () => {
    expect(videoDimmedByBackground(true)).toBe(true);
  });

  it("вкладка на виду — камера работает", () => {
    expect(videoDimmedByBackground(false)).toBe(false);
  });
});

describe("уходит ли наша картинка", () => {
  const base = { phase: "active", cameraOn: true, hidden: false } as const;

  it("камера включена, разговор идёт — уходит", () => {
    expect(shouldSendGroupVideo(base)).toBe(true);
  });

  it("кнопка выключена — не уходит", () => {
    expect(shouldSendGroupVideo({ ...base, cameraOn: false })).toBe(false);
  });

  it("до входа в комнату не уходит", () => {
    expect(shouldSendGroupVideo({ ...base, phase: "joining" })).toBe(false);
  });

  it("после выхода не уходит", () => {
    expect(shouldSendGroupVideo({ ...base, phase: "ended" })).toBe(false);
  });

  it("в скрытой вкладке не уходит — батарея и вентилятор", () => {
    expect(shouldSendGroupVideo({ ...base, hidden: true })).toBe(false);
  });
});

describe("плитки комнаты", () => {
  const room = call([
    participant("a", true),
    participant("b", true),
    participant("c"),
  ]);

  it("плитка есть у каждого, включая того, кому места под видео не досталось", () => {
    const tiles = videoTiles({
      call: room,
      selfId: "a",
      sendingVideo: true,
      remoteStreams: new Set(["b"]),
      remoteVideoOff: new Set(),
    });
    expect(tiles.map((t) => t.userId)).toEqual(["a", "b", "c"]);
  });

  it("у выключенной камеры — аватар, а не чёрный прямоугольник", () => {
    const tiles = videoTiles({
      call: room,
      selfId: "a",
      sendingVideo: true,
      remoteStreams: new Set(["b"]),
      remoteVideoOff: new Set(),
    });
    expect(tiles.find((t) => t.userId === "c")?.view).toBe("avatar");
  });

  it("чужая картинка ждёт и согласия сервера, и реального потока", () => {
    const tiles = videoTiles({
      call: room,
      selfId: "a",
      sendingVideo: true,
      remoteStreams: new Set(),
      remoteVideoOff: new Set(),
    });
    expect(tiles.find((t) => t.userId === "b")?.view).toBe("avatar");
  });

  it("поток без согласия сервера картинкой не считается", () => {
    const tiles = videoTiles({
      call: room,
      selfId: "a",
      sendingVideo: true,
      remoteStreams: new Set(["c"]),
      remoteVideoOff: new Set(),
    });
    expect(tiles.find((t) => t.userId === "c")?.view).toBe("avatar");
  });

  it("своя плитка идёт по тому, что реально уходит, а не по кнопке", () => {
    const tiles = videoTiles({
      call: room,
      selfId: "a",
      sendingVideo: false,
      remoteStreams: new Set(["b"]),
      remoteVideoOff: new Set(),
    });
    expect(tiles.find((t) => t.isSelf)?.view).toBe("avatar");
  });

  it("у соседа со скрытой вкладкой — аватар, а не замёрзший кадр", () => {
    // Место под видео за ним остаётся (он вот-вот вернётся), но кадры он
    // слать перестал и честно об этом сказал сигналом `{kind:"media"}`.
    const tiles = videoTiles({
      call: room,
      selfId: "a",
      sendingVideo: true,
      remoteStreams: new Set(["b"]),
      remoteVideoOff: new Set(["b"]),
    });
    expect(tiles.find((t) => t.userId === "b")?.view).toBe("avatar");
  });

  it("молчание про камеру трактуется как «снимает»", () => {
    const tiles = videoTiles({
      call: room,
      selfId: "a",
      sendingVideo: true,
      remoteStreams: new Set(["b"]),
      remoteVideoOff: new Set(),
    });
    expect(tiles.find((t) => t.userId === "b")?.view).toBe("video");
  });

  it("вне звонка плиток нет", () => {
    expect(
      videoTiles({
        call: null,
        selfId: "a",
        sendingVideo: false,
        remoteStreams: new Set(),
        remoteVideoOff: new Set(),
      }),
    ).toEqual([]);
  });
});

describe("кнопка «камера»", () => {
  it("когда мест хватает — доступна", () => {
    const room = call([participant("a"), participant("b", true)]);
    expect(cameraButtonState(room, "a", false)).toEqual({
      willEnable: true,
      blocked: false,
      blockedReason: null,
    });
  });

  it("четвёртому отказ с понятным текстом", () => {
    const room = call([
      participant("a", true),
      participant("b", true),
      participant("c", true),
      participant("d"),
    ]);
    const state = cameraButtonState(room, "d", false);
    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toBe(
      "В групповом видео могут участвовать трое",
    );
  });

  it("своя включённая камера не считается занятым чужим местом", () => {
    const room = call([
      participant("a", true),
      participant("b", true),
      participant("c", true),
    ]);
    expect(cameraButtonState(room, "c", true).blocked).toBe(false);
  });

  it("выключить свою камеру можно всегда", () => {
    const room = call([
      participant("a", true),
      participant("b", true),
      participant("c", true),
    ]);
    expect(cameraButtonState(room, "c", true)).toEqual({
      willEnable: false,
      blocked: false,
      blockedReason: null,
    });
  });

  it("в закрытой комнате кнопка не работает", () => {
    const room = call([participant("a")], { status: "ended" });
    expect(cameraButtonState(room, "a", false).blocked).toBe(true);
  });

  it("потолок берётся из ответа сервера, а не из константы сборки", () => {
    const room = call(
      [participant("a", true), participant("b", true), participant("c")],
      { maxVideoParticipants: 2 },
    );
    expect(cameraButtonState(room, "c", false).blocked).toBe(true);
  });
});

describe("сколько камер включено", () => {
  it("считается по ответу сервера", () => {
    expect(camerasOn(call([participant("a", true), participant("b")]))).toBe(1);
  });

  it("вне звонка — ноль", () => {
    expect(camerasOn(null)).toBe(0);
  });
});
