import { mediaDevices, MediaStream, RTCPeerConnection } from 'react-native-webrtc';
import type { ChatCallKind, ChatCallSignal, ChatIceServerDto } from '@vedamatch/shared';
import { relayedFromStats, type RtcStatsReport } from './relay-stats';

/**
 * Обёртка над `RTCPeerConnection` для звонка один на один — перенос
 * `apps/web/src/components/chat/calls/webrtc-session.ts` на
 * `react-native-webrtc`. Роли и протокол сигналинга те же: звонивший делает
 * offer, вызываемый — answer, ICE-кандидаты копятся, пока не поставлено
 * удалённое описание.
 *
 * Отличие от веба — только в слое типов. Опубликованные типы
 * `react-native-webrtc@124.x` объявляют `RTCPeerConnection`/`MediaStreamTrack`
 * наследниками `EventTarget` из `./vendor/event-target-shim`, а каталог
 * `vendor` не попал в пакет (докум `docs/mobile-calls-native.md`, §1) —
 * `addEventListener` не виден компилятору. Используются сеттеры
 * (`onicecandidate`, `ontrack`, `onconnectionstatechange`) — они объявлены
 * на самих классах и типизированы штатно, как в `ice-probe-runner.ts`.
 *
 * Не тестируется в jest-expo: склейка вокруг нативного модуля. Чистая
 * часть (разбор статистики relay) — `relay-stats.ts`, со своим тестом.
 */

export interface SessionHandlers {
  onSignal: (signal: ChatCallSignal) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onFailed: () => void;
}

/** Локальные формы событий вместо разобранных типов `react-native-webrtc` (см. шапку файла). */
interface IceCandidateEvent {
  candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null;
}
interface TrackEvent {
  streams: MediaStream[];
}

/** Сколько ждём восстановления ICE, прежде чем признать обрыв. */
const DISCONNECT_GRACE_MS = 15_000;

export class CallSession {
  private readonly pc: RTCPeerConnection;
  private readonly pending: NonNullable<IceCandidateEvent['candidate']>[] = [];
  private remoteSet = false;
  private local: MediaStream | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** Флаг «перезапуск ICE уже идёт» (VED-222, п.6 — исправление
   *  `feedback-001.md` этого этапа, non-blocking п.1): защищает от
   *  ПАРАЛЛЕЛЬНОГО вызова `restartIce()` (например, `'failed'` из
   *  `onconnectionstatechange` и смена сети из `ice-restart-policy.ts`
   *  почти одновременно) — без него второй `createOffer({iceRestart:true})`
   *  мог бы стартовать до того, как `setLocalDescription` первого
   *  завершился, и уйти сигналом поверх ещё не отправленного. Отдельно от
   *  дебаунса по времени в `ice-restart-policy.ts` (тот защищает от частого
   *  флаппинга сети, не от одновременности) — нужны оба. */
  private restartingIce = false;

  constructor(
    iceServers: ChatIceServerDto[],
    private readonly role: 'caller' | 'callee',
    private readonly handlers: SessionHandlers,
  ) {
    this.pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 });

    this.pc.onicecandidate = ((event: IceCandidateEvent) => {
      const c = event.candidate;
      handlers.onSignal({
        kind: 'candidate',
        candidate: c
          ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }
          : null,
      });
    }) as typeof this.pc.onicecandidate;

    this.pc.ontrack = ((event: TrackEvent) => {
      const [stream] = event.streams;
      if (stream) handlers.onRemoteStream(stream);
    }) as typeof this.pc.ontrack;

    this.pc.onconnectionstatechange = (() => {
      switch (this.pc.connectionState) {
        case 'connected':
          this.clearDisconnectTimer();
          handlers.onConnected();
          break;
        case 'disconnected':
          handlers.onDisconnected();
          this.armDisconnectTimer();
          break;
        case 'failed':
          // Звонивший пробует перезапустить ICE; если и это не поможет,
          // сработает таймер обрыва.
          if (role === 'caller') void this.restartIce();
          handlers.onDisconnected();
          this.armDisconnectTimer();
          break;
        case 'closed':
          this.clearDisconnectTimer();
          break;
      }
    }) as typeof this.pc.onconnectionstatechange;
  }

  /** Захватить микрофон (и камеру для видео). Бросает, если человек отказал. */
  async startLocalMedia(kind: ChatCallKind): Promise<MediaStream> {
    const stream = await mediaDevices.getUserMedia({
      // Эхоподавление/шумоподавление/автогейн у react-native-webrtc не
      // настраиваются через constraints (типы Android/iOS другие, чем в
      // браузере) — нативный аудиопайплайн WebRTC включает их по умолчанию.
      audio: true,
      video:
        kind === 'video'
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
          : false,
    });
    // В отличие от браузера, react-native-webrtc не роняет весь запрос при
    // отказе в одном из двух разрешений (`getUserMedia.ts`: `audioPerm ||
    // delete constraints.audio`) — он молча возвращает поток без нужной
    // дорожки. Без микрофона звонок бессмыслен, без камеры на видеозвонке
    // это тихая деградация без объяснения, поэтому оба случая — явный отказ,
    // как в браузере, а не «звоним чем есть».
    if (stream.getAudioTracks().length === 0) {
      for (const track of stream.getTracks()) track.stop();
      throw mediaPermissionError('Нет доступа к микрофону');
    }
    if (kind === 'video' && stream.getVideoTracks().length === 0) {
      for (const track of stream.getTracks()) track.stop();
      throw mediaPermissionError('Нет доступа к камере');
    }
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
      kind: 'sdp',
      sdp: { type: 'offer', sdp: offer.sdp ?? '' },
    });
  }

  async restartIce(): Promise<void> {
    if (this.closed || this.role !== 'caller' || this.restartingIce) return;
    this.restartingIce = true;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      this.handlers.onSignal({
        kind: 'sdp',
        sdp: { type: 'offer', sdp: offer.sdp ?? '' },
      });
    } catch {
      // Соединение уже закрыто — таймер обрыва доведёт дело до конца.
    } finally {
      this.restartingIce = false;
    }
  }

  /** Сигнал от второй стороны: offer/answer или кандидат. */
  async handleSignal(signal: ChatCallSignal): Promise<void> {
    if (this.closed) return;
    if (signal.kind === 'sdp') {
      await this.pc.setRemoteDescription(signal.sdp);
      this.remoteSet = true;
      for (const candidate of this.pending.splice(0))
        await this.pc.addIceCandidate(candidate).catch(() => undefined);
      if (signal.sdp.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.handlers.onSignal({
          kind: 'sdp',
          sdp: { type: 'answer', sdp: answer.sdp ?? '' },
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
   * Смена фронтальной/тыльной камеры без пересборки соединения — приватный
   * API react-native-webrtc (`_switchCamera`, тот же приём использует
   * эталонное приложение AppRTCMobile). Молча ничего не делает без
   * видеодорожки (аудиозвонок, камера выключена собеседником).
   */
  switchCamera(): void {
    for (const track of this.local?.getVideoTracks() ?? []) track._switchCamera();
  }

  /** Пошёл ли трафик через TURN — разбор в `relay-stats.ts`. */
  async isRelayed(): Promise<boolean | null> {
    try {
      const stats = (await this.pc.getStats()) as RtcStatsReport;
      return relayedFromStats(stats);
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
      if (!this.closed && this.pc.connectionState !== 'connected') this.handlers.onFailed();
    }, DISCONNECT_GRACE_MS);
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }
}

/** `name: 'NotAllowedError'` — тот же признак отказа, что разбирает `describeMediaError` в `call-provider.tsx`. */
function mediaPermissionError(message: string): Error {
  const error = new Error(message);
  (error as { name: string }).name = 'NotAllowedError';
  return error;
}
