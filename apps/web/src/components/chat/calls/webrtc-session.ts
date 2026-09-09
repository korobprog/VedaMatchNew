"use client";

import type { ChatCallKind, ChatCallSignal, ChatIceServerDto } from "@vedamatch/shared";

/**
 * Обёртка над `RTCPeerConnection` для звонка один на один.
 *
 * Роли жёсткие: звонивший делает offer, вызываемый — answer. ICE-кандидаты
 * копятся, пока не поставлено удалённое описание, — иначе браузер их
 * отбрасывает, и соединение собирается дольше или не собирается вовсе.
 * Сигналы наружу уходят через `onSignal`; чем их доставить — дело хука.
 *
 * В jsdom не запускается: это склейка вокруг браузерного API, решения
 * живут в `call-machine.ts`.
 */

export interface SessionHandlers {
  onSignal: (signal: ChatCallSignal) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onFailed: () => void;
}

/** В lib.dom нет типа статистики кандидата — описываем нужное поле сами. */
interface CandidateStats {
  candidateType?: string;
}

/** Сколько ждём восстановления ICE, прежде чем признать обрыв. */
const DISCONNECT_GRACE_MS = 15_000;

export class CallSession {
  private readonly pc: RTCPeerConnection;
  private readonly pending: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private local: MediaStream | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    iceServers: ChatIceServerDto[],
    private readonly role: "caller" | "callee",
    private readonly handlers: SessionHandlers,
  ) {
    this.pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 });

    this.pc.onicecandidate = (event) => {
      const c = event.candidate;
      handlers.onSignal({
        kind: "candidate",
        candidate: c
          ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }
          : null,
      });
    };

    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) handlers.onRemoteStream(stream);
    };

    this.pc.onconnectionstatechange = () => {
      switch (this.pc.connectionState) {
        case "connected":
          this.clearDisconnectTimer();
          handlers.onConnected();
          break;
        case "disconnected":
          handlers.onDisconnected();
          this.armDisconnectTimer();
          break;
        case "failed":
          // Звонивший пробует перезапустить ICE; если и это не поможет,
          // сработает таймер обрыва.
          if (role === "caller") void this.restartIce();
          handlers.onDisconnected();
          this.armDisconnectTimer();
          break;
        case "closed":
          this.clearDisconnectTimer();
          break;
      }
    };
  }

  /** Захватить микрофон (и камеру для видео). Бросает, если человек отказал. */
  async startLocalMedia(kind: ChatCallKind): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video:
        kind === "video"
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
          : false,
    });
    this.local = stream;
    for (const track of stream.getTracks()) this.pc.addTrack(track, stream);
    return stream;
  }

  get localStream(): MediaStream | null {
    return this.local;
  }

  /** Звонивший: собрать и отправить offer. */
  async makeOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.handlers.onSignal({
      kind: "sdp",
      sdp: { type: "offer", sdp: offer.sdp ?? "" },
    });
  }

  async restartIce(): Promise<void> {
    if (this.closed || this.role !== "caller") return;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      this.handlers.onSignal({
        kind: "sdp",
        sdp: { type: "offer", sdp: offer.sdp ?? "" },
      });
    } catch {
      // Соединение уже закрыто — таймер обрыва доведёт дело до конца.
    }
  }

  /** Сигнал от второй стороны: offer/answer или кандидат. */
  async handleSignal(signal: ChatCallSignal): Promise<void> {
    if (this.closed) return;
    if (signal.kind === "sdp") {
      await this.pc.setRemoteDescription(signal.sdp);
      this.remoteSet = true;
      for (const candidate of this.pending.splice(0))
        await this.pc.addIceCandidate(candidate).catch(() => undefined);
      if (signal.sdp.type === "offer") {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.handlers.onSignal({
          kind: "sdp",
          sdp: { type: "answer", sdp: answer.sdp ?? "" },
        });
      }
      return;
    }
    if (!signal.candidate) return; // конец сбора у собеседника
    if (!this.remoteSet) {
      this.pending.push(signal.candidate);
      return;
    }
    await this.pc.addIceCandidate(signal.candidate).catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    for (const track of this.local?.getAudioTracks() ?? []) track.enabled = !muted;
  }

  setCameraOff(off: boolean): void {
    for (const track of this.local?.getVideoTracks() ?? []) track.enabled = !off;
  }

  /**
   * Пошёл ли трафик через TURN. По выбранной паре кандидатов: если хоть
   * одна сторона relay — звонок релейный. null — статистика недоступна.
   */
  async isRelayed(): Promise<boolean | null> {
    try {
      const stats = await this.pc.getStats();
      let selected: RTCIceCandidatePairStats | null = null;
      stats.forEach((report) => {
        if (report.type === "transport" && report.selectedCandidatePairId) {
          const pair = stats.get(report.selectedCandidatePairId) as
            | RTCIceCandidatePairStats
            | undefined;
          if (pair) selected = pair;
        }
        if (
          !selected &&
          report.type === "candidate-pair" &&
          (report as RTCIceCandidatePairStats).state === "succeeded" &&
          (report as RTCIceCandidatePairStats & { selected?: boolean }).selected
        )
          selected = report as RTCIceCandidatePairStats;
      });
      if (!selected) return null;
      const pair = selected as RTCIceCandidatePairStats;
      const local = stats.get(pair.localCandidateId) as
        | CandidateStats
        | undefined;
      const remote = stats.get(pair.remoteCandidateId) as
        | CandidateStats
        | undefined;
      if (!local && !remote) return null;
      return local?.candidateType === "relay" || remote?.candidateType === "relay";
    } catch {
      return null;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearDisconnectTimer();
    for (const track of this.local?.getTracks() ?? []) track.stop();
    this.local = null;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }

  private armDisconnectTimer(): void {
    if (this.disconnectTimer) return;
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null;
      if (!this.closed && this.pc.connectionState !== "connected")
        this.handlers.onFailed();
    }, DISCONNECT_GRACE_MS);
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }
}
