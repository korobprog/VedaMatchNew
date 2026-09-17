import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatCallSignal } from "@vedamatch/shared";
import { CallSession, type SessionHandlers } from "./webrtc-session";

/**
 * «Тест связки» из feedback-002.md (VED-261, блокирующий п.1): проверяет не
 * отдельно взятую функцию, а `CallSession.handleSignal` целиком — с реальной
 * (хоть и фальшивой) машиной состояний `RTCSignalingState`, а не только
 * `decideSdpApply` в изоляции (`webrtc-signal-guard.spec.ts`).
 *
 * Разделение ответственности между этим файлом и сервером важно понимать
 * буквально: сервер (`chat-calls.service.ts`, `claimClientSignal`) не даёт
 * partial-success ретраю доставить ОДИН И ТОТ ЖЕ офер дважды — значит
 * повторный офер, порождающий второй answer, сюда в норме никогда не
 * долетает. Этот файл проверяет вторую, независимую линию защиты —
 * `signalingState`: она полностью закрывает ровно тот сценарий из
 * оригинального багрепорта, который приводил к необработанному исключению
 * («ответ второй стороны долетает до звонящего, чей `pc` уже `stable`») —
 * ниже это тест «answer в stable игнорируется» — и симметричный случай
 * glare для offer'а.
 */

interface FakeSdp {
  type: "offer" | "answer";
  sdp: string;
}

class FakeRTCPeerConnection {
  signalingState: string = "stable";
  connectionState = "new";
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  setRemoteDescriptionCalls: FakeSdp[] = [];
  createAnswerCalls = 0;
  createOfferCalls = 0;

  constructor() {}

  addTrack(): void {}

  async createOffer(): Promise<FakeSdp> {
    this.createOfferCalls += 1;
    return { type: "offer", sdp: "offer-sdp" };
  }

  async createAnswer(): Promise<FakeSdp> {
    this.createAnswerCalls += 1;
    return { type: "answer", sdp: "answer-sdp" };
  }

  async setLocalDescription(desc: FakeSdp): Promise<void> {
    if (desc.type === "offer") this.signalingState = "have-local-offer";
    else if (desc.type === "answer") this.signalingState = "stable";
  }

  /**
   * Имитирует реальный `RTCPeerConnection`: бросает `InvalidStateError` в
   * состояниях, в которых `handleSignal` НЕ ДОЛЖЕН вызывать этот метод
   * вовсе (наш guard обязан отсечь их раньше) — так тест ловит регрессию в
   * самом guard'е, а не только проверяет его изолированно.
   */
  async setRemoteDescription(desc: FakeSdp): Promise<void> {
    if (desc.type === "answer" && this.signalingState !== "have-local-offer")
      throw new DOMException(
        `Failed to set remote answer sdp: Called in wrong state: ${this.signalingState}`,
        "InvalidStateError",
      );
    if (desc.type === "offer" && this.signalingState === "have-local-offer")
      throw new DOMException("glare", "InvalidStateError");
    this.setRemoteDescriptionCalls.push(desc);
    if (desc.type === "offer") this.signalingState = "have-remote-offer";
    else this.signalingState = "stable";
  }

  async addIceCandidate(): Promise<void> {}

  async getStats(): Promise<Map<string, unknown>> {
    return new Map();
  }

  close(): void {
    this.signalingState = "closed";
  }
}

function handlers(): SessionHandlers & { sent: ChatCallSignal[] } {
  const sent: ChatCallSignal[] = [];
  return {
    sent,
    onSignal: (signal) => sent.push(signal),
    onRemoteStream: () => undefined,
    onConnected: () => undefined,
    onDisconnected: () => undefined,
    onFailed: () => undefined,
  };
}

describe("CallSession.handleSignal — таблица состояний signalingState (VED-261, feedback-002)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection =
      FakeRTCPeerConnection;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("offer в stable применяется и порождает ровно один answer", async () => {
    const h = handlers();
    const session = new CallSession([], "callee", h);
    const pc = (session as unknown as { pc: FakeRTCPeerConnection }).pc;

    await session.handleSignal({
      kind: "sdp",
      sdp: { type: "offer", sdp: "remote-offer" },
    });

    expect(pc.setRemoteDescriptionCalls).toHaveLength(1);
    expect(pc.createAnswerCalls).toBe(1);
    expect(h.sent).toEqual([
      { kind: "sdp", sdp: { type: "answer", sdp: "answer-sdp" } },
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("answer в stable (поздний/повторный ответ после уже завершённых переговоров) игнорируется без исключения", async () => {
    const h = handlers();
    const session = new CallSession([], "caller", h);
    const pc = (session as unknown as { pc: FakeRTCPeerConnection }).pc;
    expect(pc.signalingState).toBe("stable"); // переговоры не начаты — тот же класс состояния, что и «уже завершены»

    await expect(
      session.handleSignal({
        kind: "sdp",
        sdp: { type: "answer", sdp: "stray-answer" },
      }),
    ).resolves.toBeUndefined();

    expect(pc.setRemoteDescriptionCalls).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("answer");
  });

  it("answer после своего offer (have-local-offer) применяется как обычно", async () => {
    const h = handlers();
    const session = new CallSession([], "caller", h);
    await session.makeOffer();
    const pc = (session as unknown as { pc: FakeRTCPeerConnection }).pc;
    expect(pc.signalingState).toBe("have-local-offer");

    await session.handleSignal({
      kind: "sdp",
      sdp: { type: "answer", sdp: "real-answer" },
    });

    expect(pc.setRemoteDescriptionCalls).toEqual([
      { type: "answer", sdp: "real-answer" },
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("offer, пришедший пока мы сами ждём ответа на свой offer (glare), игнорируется", async () => {
    const h = handlers();
    const session = new CallSession([], "caller", h);
    await session.makeOffer();
    const pc = (session as unknown as { pc: FakeRTCPeerConnection }).pc;
    expect(pc.signalingState).toBe("have-local-offer");

    await expect(
      session.handleSignal({
        kind: "sdp",
        sdp: { type: "offer", sdp: "crossed-offer" },
      }),
    ).resolves.toBeUndefined();

    expect(pc.setRemoteDescriptionCalls).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("glare");
  });

  it("второй offer до собственного ответа на первый (have-remote-offer) — валиден по спецификации, применяется", async () => {
    const h = handlers();
    const session = new CallSession([], "callee", h);
    const pc = (session as unknown as { pc: FakeRTCPeerConnection }).pc;
    // Имитируем «застрявшее» состояние have-remote-offer напрямую — реальный
    // браузер попадает сюда между setRemoteDescription(offer) и ответом.
    pc.signalingState = "have-remote-offer";

    await session.handleSignal({
      kind: "sdp",
      sdp: { type: "offer", sdp: "second-offer" },
    });

    expect(pc.setRemoteDescriptionCalls).toEqual([
      { type: "offer", sdp: "second-offer" },
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
