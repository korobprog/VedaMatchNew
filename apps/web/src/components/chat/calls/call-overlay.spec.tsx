import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ChatCallDto, ChatCallKind } from "@vedamatch/shared";
import { CallOverlay } from "./call-overlay";
import { IDLE_STATE, type CallPhase, type CallState } from "./call-machine";

/**
 * VED-359: «в браузере не было видеосвязи, только аудио».
 *
 * Тест повторяет порядок событий живого звонка, а не конечную картинку:
 * поток собеседника приходит в `ontrack` (на `setRemoteDescription`), и
 * только позже соединение встаёт и фаза становится `active`. Раньше
 * `<video>` рендерился условием на фазу и появлялся уже после того, как
 * эффект с `srcObject` отработал свой единственный раз, — картинка не
 * привязывалась никогда.
 */

const me = { id: "me", name: "Я", avatarUrl: null, lastSeenAt: null };
const other = { id: "other", name: "Собеседник", avatarUrl: null, lastSeenAt: null };

const call = (kind: ChatCallKind): ChatCallDto => ({
  id: "c1",
  conversationId: "conv",
  kind,
  status: "accepted",
  caller: other,
  callee: me,
  createdAt: "2026-09-22T10:00:00Z",
});

const calls = {
  state: IDLE_STATE as CallState,
  selfId: "me",
  localStream: null as MediaStream | null,
  remoteStream: null as MediaStream | null,
  start: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  hangUp: vi.fn(),
  toggleMute: vi.fn(),
  toggleCamera: vi.fn(),
  dismiss: vi.fn(),
};

vi.mock("./call-provider", () => ({ useChatCalls: () => calls }));

/** Поток нам нужен только как ссылка: сравниваем, что попало в `srcObject`. */
const fakeStream = { id: "remote" } as unknown as MediaStream;

function setCall(kind: ChatCallKind, phase: CallPhase, remoteStream: MediaStream | null) {
  calls.state = { ...IDLE_STATE, phase, call: call(kind), connectedAt: 0 };
  calls.remoteStream = remoteStream;
}

beforeAll(() => {
  // jsdom не умеет воспроизводить медиа, а `autoPlay` зовёт `play()`.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
});

describe("CallOverlay — поток собеседника", () => {
  it("видеозвонок: картинка привязана, хотя поток пришёл раньше фазы «разговор»", () => {
    setCall("video", "connecting", null);
    const view = render(<CallOverlay />);

    // `ontrack`: поток есть, соединение ещё не встало — ровно тот момент,
    // в который раньше привязывать было не к чему.
    setCall("video", "connecting", fakeStream);
    view.rerender(<CallOverlay />);

    // Соединение встало. Нового потока не будет — эффект больше не
    // сработает, поэтому привязка обязана была случиться шагом раньше.
    setCall("video", "active", fakeStream);
    view.rerender(<CallOverlay />);

    const video = view.container.querySelector<HTMLVideoElement>(
      '[data-testid="remote-video"]',
    );
    expect(video).not.toBeNull();
    expect(video!.srcObject).toBe(fakeStream);
    expect(video!.hidden).toBe(false);
  });

  it("видеозвонок до разговора: элемент в документе, но картинка спрятана", () => {
    setCall("video", "connecting", fakeStream);
    const view = render(<CallOverlay />);
    const video = view.container.querySelector<HTMLVideoElement>(
      '[data-testid="remote-video"]',
    );
    expect(video).not.toBeNull();
    expect(video!.hidden).toBe(true);
    // Пока картинки нет, человек видит собеседника по имени и аватару.
    expect(view.getByRole("heading", { name: "Собеседник" })).toBeInTheDocument();
  });

  it("видеозвонок: второго элемента на том же потоке нет — иначе эхо", () => {
    setCall("video", "active", fakeStream);
    const view = render(<CallOverlay />);
    expect(view.container.querySelector("audio")).toBeNull();
  });

  it("аудиозвонок: голос через <audio>, <video> не заводим вовсе", () => {
    setCall("audio", "active", fakeStream);
    const view = render(<CallOverlay />);
    const audio = view.container.querySelector<HTMLAudioElement>("audio");
    expect(audio).not.toBeNull();
    expect(audio!.srcObject).toBe(fakeStream);
    expect(view.container.querySelector('[data-testid="remote-video"]')).toBeNull();
  });
});
