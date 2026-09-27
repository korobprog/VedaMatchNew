import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  ChatGroupCallDto,
  ChatGroupCallParticipantDto,
} from "@vedamatch/shared";
import { GroupCallsContext, type GroupCallsApi } from "./group-call-context";
import { IDLE_GROUP_CALL_STATE } from "./group-call-state";
import { GroupCallOverlay } from "./group-call-overlay";

/**
 * Панель звонка при показе экрана (VED-360): что человек видит и что
 * слышит скринридер. WebRTC здесь нет — контекст подставной, потоки —
 * заглушки: проверяется раскладка и подписи, а не картинка.
 */

beforeAll(() => {
  // jsdom не умеет воспроизведение, а плитка зовёт `play()`.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
  if (!window.matchMedia)
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
});

function participant(
  id: string,
  opts: { video?: boolean; screen?: boolean } = {},
): ChatGroupCallParticipantDto {
  return {
    user: { id, name: `Имя ${id}`, avatarUrl: null, lastSeenAt: null },
    joinedAt: "2026-09-27T10:00:00.000Z",
    muted: false,
    video: opts.video ?? false,
    screen: opts.screen ?? false,
    host: id === "me",
  };
}

function room(participants: ChatGroupCallParticipantDto[]): ChatGroupCallDto {
  return {
    id: "room-1",
    conversationId: "conv-1",
    kind: "audio",
    status: "live",
    hostId: "me",
    startedBy: { id: "me", name: "Имя me" },
    createdAt: "2026-09-27T10:00:00.000Z",
    endedAt: null,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    participants,
  };
}

const fakeStream = {} as MediaStream;

function api(
  call: ChatGroupCallDto,
  over: Partial<GroupCallsApi> = {},
): GroupCallsApi {
  return {
    state: {
      ...IDLE_GROUP_CALL_STATE,
      phase: "active",
      call,
      joinedAt: Date.now(),
    },
    selfId: "me",
    expanded: true,
    callInConversation: () => call,
    watchConversation: vi.fn(),
    startOrJoin: vi.fn(() => Promise.resolve()),
    join: vi.fn(() => Promise.resolve()),
    leave: vi.fn(() => Promise.resolve()),
    toggleMute: vi.fn(),
    cameraOn: false,
    sendingVideo: false,
    toggleCamera: vi.fn(() => Promise.resolve()),
    localVideoStream: null,
    screenSupported: true,
    screenOn: false,
    toggleScreenShare: vi.fn(() => Promise.resolve()),
    localScreenStream: null,
    remoteStreams: {},
    remoteVideoOff: {},
    clearActionError: vi.fn(),
    setExpanded: vi.fn(),
    dismiss: vi.fn(),
    ...over,
  };
}

function renderWith(value: GroupCallsApi) {
  return render(
    <GroupCallsContext.Provider value={value}>
      <GroupCallOverlay />
    </GroupCallsContext.Provider>,
  );
}

describe("кнопка «Показать экран»", () => {
  it("есть там, где браузер умеет показ, и начинает его", async () => {
    const value = api(room([participant("me"), participant("b")]));
    renderWith(value);
    await userEvent.click(screen.getByRole("button", { name: "Показать экран" }));
    expect(value.toggleScreenShare).toHaveBeenCalled();
  });

  it("в браузере телефона её нет вовсе", () => {
    renderWith(
      api(room([participant("me"), participant("b")]), {
        screenSupported: false,
      }),
    );
    expect(screen.queryByRole("button", { name: /экран/i })).toBeNull();
  });

  it("показывает другой — погашена и называет кого", () => {
    renderWith(
      api(
        room([
          participant("me"),
          participant("b", { video: true, screen: true }),
        ]),
      ),
    );
    expect(
      screen.getByRole("button", {
        name: "Показать экран нельзя: Экран показывает Имя b",
      }),
    ).toBeTruthy();
  });

  it("свой показ — «Остановить показ» и подпись для остальных", async () => {
    const value = api(
      room([participant("me", { video: true, screen: true }), participant("b")]),
      {
        screenOn: true,
        sendingVideo: true,
        localScreenStream: fakeStream,
      },
    );
    renderWith(value);
    expect(screen.getByText("Вы показываете экран")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Остановить показ" }));
    expect(value.toggleScreenShare).toHaveBeenCalled();
  });

  it("камера во время показа решает, вернётся ли она после", () => {
    renderWith(
      api(room([participant("me", { video: true, screen: true })]), {
        screenOn: true,
        sendingVideo: true,
        cameraOn: true,
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Не включать камеру после показа экрана",
      }),
    ).toBeTruthy();
  });
});

describe("чужой экран на сцене", () => {
  const sharing = () =>
    api(
      room([
        participant("me"),
        participant("b", { video: true, screen: true }),
        participant("c", { video: true }),
      ]),
      { remoteStreams: { b: fakeStream, c: fakeStream } },
    );

  it("экран — отдельной крупной плиткой, остальные полосой", () => {
    renderWith(sharing());
    expect(
      screen.getByRole("group", { name: /Имя b.*показывает экран/ }),
    ).toBeTruthy();
    const strip = screen.getByRole("list", { name: "Остальные в звонке" });
    expect(strip.querySelectorAll("li")).toHaveLength(2);
  });

  it("проговаривается, кто показывает", () => {
    renderWith(sharing());
    expect(screen.getByText("Имя b показывает экран")).toBeTruthy();
  });

  it("экран виден целиком и не зеркалится, камера — как прежде", () => {
    const { container } = renderWith(sharing());
    const videos = [...container.querySelectorAll("video")];
    const contained = videos.filter((v) => v.className.includes("object-contain"));
    expect(contained).toHaveLength(1);
    expect(contained[0].className).not.toContain("-scale-x-100");
    expect(
      videos.filter((v) => v.className.includes("object-cover")),
    ).toHaveLength(1);
  });

  it("«Во весь экран» разворачивает сцену, «Свернуть» — обратно", async () => {
    renderWith(sharing());
    await userEvent.click(
      screen.getByRole("button", { name: /Развернуть экран.*Имя b/ }),
    );
    // В jsdom нет Fullscreen API — работает запасной режим поверх панели.
    const stage = screen.getByRole("group", { name: /показывает экран/ });
    expect(stage.className).toContain("fixed");
    await userEvent.click(screen.getByRole("button", { name: "Свернуть экран" }));
    expect(stage.className).not.toContain("fixed");
  });

  it("свой экран на сцену не идёт — обычная сетка", () => {
    renderWith(
      api(
        room([participant("me", { video: true, screen: true }), participant("b")]),
        { screenOn: true, sendingVideo: true, localScreenStream: fakeStream },
      ),
    );
    expect(screen.queryByRole("group", { name: /показывает экран/ })).toBeNull();
    expect(screen.getByRole("list", { name: "Кто в звонке" })).toBeTruthy();
  });
});
