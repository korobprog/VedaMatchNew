import { describe, expect, it } from "vitest";
import type {
  ChatGroupCallDto,
  ChatGroupCallParticipantDto,
} from "@vedamatch/shared";
import {
  cameraToggleNeedsServer,
  canShareScreen,
  describeScreenShareError,
  screenFlagStale,
  screenButtonState,
  screenSharer,
  screenStopPatch,
} from "./screen-share";
import { outgoingVideo, videoTiles } from "./group-video-state";

function participant(
  id: string,
  opts: { video?: boolean; screen?: boolean } = {},
): ChatGroupCallParticipantDto {
  return {
    user: { id, name: `Имя ${id}`, avatarUrl: null, lastSeenAt: null },
    joinedAt: new Date().toISOString(),
    muted: false,
    video: opts.video ?? false,
    screen: opts.screen ?? false,
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

const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("есть ли кнопка «Показать экран»", () => {
  it("десктопный браузер с getDisplayMedia — есть", () => {
    expect(
      canShareScreen({
        hasGetDisplayMedia: true,
        userAgent: DESKTOP_CHROME,
        maxTouchPoints: 0,
      }),
    ).toBe(true);
  });

  it("без getDisplayMedia — нет", () => {
    expect(
      canShareScreen({
        hasGetDisplayMedia: false,
        userAgent: DESKTOP_CHROME,
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it("браузер телефона — нет, даже если функция объявлена", () => {
    for (const userAgent of [ANDROID_CHROME, IPHONE_SAFARI])
      expect(
        canShareScreen({ hasGetDisplayMedia: true, userAgent, maxTouchPoints: 5 }),
      ).toBe(false);
  });

  it("iPad, прикинувшийся Маком, — нет", () => {
    expect(
      canShareScreen({
        hasGetDisplayMedia: true,
        userAgent: IPAD_AS_MAC,
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });
});

describe("кто показывает", () => {
  it("по признаку с сервера", () => {
    expect(
      screenSharer(
        call([participant("a"), participant("b", { video: true, screen: true })]),
      ),
    ).toEqual({ id: "b", name: "Имя b" });
    expect(screenSharer(call([participant("a")]))).toBeNull();
    expect(screenSharer(null)).toBeNull();
  });
});

describe("кнопка «Показать экран»", () => {
  const supported = { sharing: false, supported: true };

  it("не умеет браузер — кнопки нет", () => {
    expect(
      screenButtonState(call([participant("a")]), "a", {
        sharing: false,
        supported: false,
      }).visible,
    ).toBe(false);
  });

  it("свободно — можно", () => {
    expect(screenButtonState(call([participant("a")]), "a", supported)).toEqual({
      visible: true,
      willStart: true,
      blocked: false,
      blockedReason: null,
    });
  });

  it("показывает другой — погашена и называет кого", () => {
    const state = screenButtonState(
      call([participant("a"), participant("b", { video: true, screen: true })]),
      "a",
      supported,
    );
    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toBe("Экран показывает Имя b");
  });

  it("мест под видео нет, своей камеры нет — погашена", () => {
    const state = screenButtonState(
      call([
        participant("a", { video: true }),
        participant("b", { video: true }),
        participant("c", { video: true }),
        participant("d"),
      ]),
      "d",
      supported,
    );
    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toMatch(/места под видео заняты/);
  });

  it("мест нет, но своя камера включена — можно: экран берёт её место", () => {
    const state = screenButtonState(
      call([
        participant("a", { video: true }),
        participant("b", { video: true }),
        participant("c", { video: true }),
      ]),
      "c",
      supported,
    );
    expect(state.blocked).toBe(false);
  });

  it("свой показ остановить можно всегда", () => {
    expect(
      screenButtonState(
        call([participant("a", { video: true, screen: true })]),
        "a",
        { sharing: true, supported: true },
      ),
    ).toMatchObject({ willStart: false, blocked: false });
  });

  it("звонок закончился — погашена", () => {
    expect(
      screenButtonState(call([], { status: "ended" }), "a", supported).blocked,
    ).toBe(true);
  });
});

describe("конец показа", () => {
  it("камера была включена — возвращается", () => {
    expect(screenStopPatch(true)).toEqual({ screen: false, video: true });
  });

  it("камеры не было — видео гаснет, место отдаётся", () => {
    expect(screenStopPatch(false)).toEqual({ screen: false, video: false });
  });

  it("«камера» во время показа сервер не трогает", () => {
    expect(cameraToggleNeedsServer(true)).toBe(false);
    expect(cameraToggleNeedsServer(false)).toBe(true);
  });
});

describe("что уходит в видео-отправитель", () => {
  const base = {
    phase: "active",
    cameraOn: false,
    screenOn: false,
    hidden: false,
  } as const;

  it("ничего не включено — ничего", () => {
    expect(outgoingVideo(base)).toBeNull();
  });

  it("экран сильнее камеры", () => {
    expect(outgoingVideo({ ...base, cameraOn: true, screenOn: true })).toBe(
      "screen",
    );
  });

  it("скрытая вкладка гасит камеру, но не экран", () => {
    expect(outgoingVideo({ ...base, cameraOn: true, hidden: true })).toBeNull();
    expect(outgoingVideo({ ...base, screenOn: true, hidden: true })).toBe(
      "screen",
    );
  });

  it("показ кончился — камера возвращается, если была включена", () => {
    expect(outgoingVideo({ ...base, cameraOn: true })).toBe("camera");
  });

  it("вне разговора не уходит ничего", () => {
    expect(outgoingVideo({ ...base, phase: "joining", screenOn: true })).toBeNull();
  });
});

describe("плитка экрана", () => {
  it("чужой экран помечен по признаку с сервера", () => {
    const tiles = videoTiles({
      call: call([
        participant("me"),
        participant("b", { video: true, screen: true }),
      ]),
      selfId: "me",
      sendingVideo: false,
      remoteStreams: new Set(["b"]),
      remoteVideoOff: new Set(),
    });
    expect(tiles.find((t) => t.userId === "b")).toMatchObject({
      view: "video",
      screen: true,
    });
  });

  it("свой показ помечен, пока картинка реально уходит", () => {
    const room = call([participant("me", { video: true, screen: true })]);
    const input = {
      call: room,
      selfId: "me",
      remoteStreams: new Set<string>(),
      remoteVideoOff: new Set<string>(),
    };
    expect(
      videoTiles({ ...input, sendingVideo: true, sharingScreen: true })[0],
    ).toMatchObject({ view: "video", screen: true });
    expect(
      videoTiles({ ...input, sendingVideo: false, sharingScreen: true })[0],
    ).toMatchObject({ view: "avatar", screen: false });
  });

  it("камера — не экран", () => {
    const tiles = videoTiles({
      call: call([participant("me"), participant("b", { video: true })]),
      selfId: "me",
      sendingVideo: false,
      remoteStreams: new Set(["b"]),
      remoteVideoOff: new Set(),
    });
    expect(tiles.find((t) => t.userId === "b")?.screen).toBe(false);
  });
});

describe("показ, потерянный по дороге", () => {
  const room = call([participant("me", { video: true, screen: true })]);

  it("сервер думает, что показываем, а мы нет — чиним", () => {
    expect(
      screenFlagStale(room, "me", { sharing: false, pending: false }),
    ).toBe(true);
  });

  it("пока идёт запрос начала показа — не трогаем", () => {
    expect(
      screenFlagStale(room, "me", { sharing: false, pending: true }),
    ).toBe(false);
  });

  it("показываем — всё сходится", () => {
    expect(
      screenFlagStale(room, "me", { sharing: true, pending: false }),
    ).toBe(false);
  });

  it("не показываем и сервер согласен — чинить нечего", () => {
    expect(
      screenFlagStale(call([participant("me")]), "me", {
        sharing: false,
        pending: false,
      }),
    ).toBe(false);
  });
});

describe("почему показ не начался", () => {
  class ServerError extends Error {}
  const isServer = (e: unknown): e is Error => e instanceof ServerError;
  const domError = (name: string, message = "") =>
    Object.assign(new Error(message), { name });

  it("«Отмена» в окне выбора — молчим", () => {
    expect(
      describeScreenShareError(
        domError("NotAllowedError", "Permission denied"),
        isServer,
      ),
    ).toBeNull();
  });

  it("запрет системы — подсказываем, где разрешить", () => {
    expect(
      describeScreenShareError(
        domError("NotAllowedError", "Permission denied by system"),
        isServer,
      ),
    ).toMatch(/Запись экрана/);
  });

  it("отказ сервера — его текстом", () => {
    expect(
      describeScreenShareError(
        new ServerError("Экран уже показывает Имя b"),
        isServer,
      ),
    ).toBe("Экран уже показывает Имя b");
  });

  it("неизвестное — общим текстом, а не «undefined»", () => {
    expect(describeScreenShareError(null, isServer)).toBe(
      "Не удалось показать экран",
    );
  });
});
