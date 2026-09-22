import { MediaStream, MediaStreamTrack, RTCPeerConnection } from 'react-native-webrtc';
import type { ChatCallSignal, ChatIceServerDto } from '@vedamatch/shared';
import { normalizeIceServers } from '@/lib/calls/ice-server-normalize';
import {
  withVideoEncoding,
  type SenderParameters,
  type VideoEncoding,
} from '@/lib/calls/video-encoding';
import { decideSdpApply, type SignalingState } from '@/lib/calls/webrtc-signal-guard';
import { localAudioLevel, remoteAudioLevel, type StatsEntry } from './speaking-state';

/**
 * ОДНО соединение mesh'а — с одним собеседником.
 *
 * Отличия от `CallSession` звонка один на один, из-за которых это отдельный
 * класс, а не параметр к тому:
 * - роль `caller`/`callee` здесь не свойство звонка, а свойство ПАРЫ: с
 *   одним человеком мы инициатор, с другим — отвечающий, и решает это
 *   `group-call-peers.ts`, а не сервер;
 * - локальный поток один на все соединения (микрофон захватывается один
 *   раз в провайдере и раздаётся сюда), поэтому `close()` его НЕ
 *   останавливает — иначе выход одного собеседника выключал бы микрофон
 *   для остальных. Это главная ловушка mesh'а, и она здесь именно поэтому
 *   вынесена в комментарий, а не подразумевается.
 *
 * Видео (VED-293, этап 4) заводится ЗАРАНЕЕ и пустым:
 * `addTransceiver('video')` без дорожки при создании соединения, дальше
 * камера включается и выключается через `sender.replaceTrack(track | null)`.
 * Это главное решение видео в mesh'е, и вот почему оно такое. Добавление
 * дорожки в уже работающее соединение (`addTrack`) требует нового
 * offer/answer, а инициатор пары назначен раз и навсегда
 * (`group-call-peers.ts`): тому, кто в паре отвечающий, пришлось бы либо
 * просить соседа пересогласовать, либо выставлять встречный offer — то есть
 * ровно тот glare, от которого правило инициатора и спасает. Умножьте на
 * три пары и на то, что камеру щёлкают туда-сюда. `replaceTrack`
 * пересогласования не требует вовсе, и включение камеры остаётся мгновенным
 * и безопасным при любом числе собеседников.
 *
 * Цена решения названа честно: в SDP всегда есть видеосекция, даже в
 * разговоре, где камеру никто не включит. Это несколько сотен байт на
 * соединение при его установке и ноль трафика дальше — дорожки нет, кодер
 * не работает.
 *
 * Не тестируется в jest-expo: склейка вокруг нативного модуля. Чистое —
 * `group-call-peers.ts` (кто кому шлёт offer), `speaking-state.ts` (разбор
 * уровней), `group-video-quality.ts` (потолок качества по составу) и
 * `webrtc-signal-guard.ts` (когда применять SDP), у всех свои спеки. Тот же
 * приём, что у `webrtc-session.ts`.
 */

export interface PeerHandlers {
  onSignal: (signal: ChatCallSignal) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onStateChange: (state: 'connecting' | 'connected' | 'reconnecting' | 'failed') => void;
}

interface IceCandidateEvent {
  candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null;
}
interface TrackEvent {
  streams: MediaStream[];
}

/**
 * Форма отправителя, которая нас интересует. Опубликованные типы
 * `react-native-webrtc` описывают `getParameters` по-своему и не дают
 * положить туда наш `SenderParameters` (он намеренно с индексной
 * сигнатурой, чтобы сохранить незнакомые поля дословно). Приведение
 * `unknown` — ровно то же, что делает `webrtc-session.ts` звонка один на
 * один; узкий интерфейс рядом с ним оставляет проверку на опечатку в том
 * единственном месте, где мы вообще трогаем видео.
 */
interface VideoSender {
  replaceTrack(track: MediaStreamTrack | null): Promise<void>;
  getParameters(): unknown;
  setParameters(params: unknown): Promise<void>;
}

/** Столько же, сколько у звонка один на один. */
const DISCONNECT_GRACE_MS = 15_000;

export class GroupPeerLink {
  private readonly pc: RTCPeerConnection;
  private readonly pending: NonNullable<IceCandidateEvent['candidate']>[] = [];
  private remoteSet = false;
  private answerInFlight = false;
  private restartingIce = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** Отправитель пустой видеосекции — см. шапку класса. */
  private readonly videoSender: VideoSender;

  constructor(
    readonly userId: string,
    iceServers: ChatIceServerDto[],
    /** Мы инициируем эту пару (решает `planPeers`). */
    private readonly initiator: boolean,
    localStream: MediaStream,
    private readonly handlers: PeerHandlers,
  ) {
    // Та же конфигурация, что у звонка один на один: один URL на запись
    // (`normalizeIceServers`) и непрерывный сбор кандидатов — без него
    // libwebrtc на Android останавливает сбор на первой рабочей паре и в
    // одной сети собирает только `host`, см. шапку `webrtc-session.ts`.
    const config = {
      iceServers: normalizeIceServers(iceServers),
      continualGatheringPolicy: 'gather_continually',
    };
    this.pc = new RTCPeerConnection(
      JSON.parse(JSON.stringify(config)) as ConstructorParameters<typeof RTCPeerConnection>[0],
    );

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
          handlers.onStateChange('connected');
          break;
        case 'disconnected':
          handlers.onStateChange('reconnecting');
          this.armDisconnectTimer();
          break;
        case 'failed':
          if (this.initiator) void this.restartIce();
          handlers.onStateChange('reconnecting');
          this.armDisconnectTimer();
          break;
        case 'closed':
          this.clearDisconnectTimer();
          break;
      }
    }) as typeof this.pc.onconnectionstatechange;

    for (const track of localStream.getAudioTracks())
      this.pc.addTrack(track, localStream);
    // Пустая видеосекция заводится сразу — см. шапку класса. Направление
    // `sendrecv`: мы вправе и показывать, и смотреть, а кто из пары включит
    // камеру первым, заранее неизвестно.
    this.videoSender = this.pc.addTransceiver('video', {
      direction: 'sendrecv',
    }).sender as unknown as VideoSender;
    handlers.onStateChange('connecting');
  }

  /** Инициатор пары: собрать и отправить offer. */
  async makeOffer(): Promise<void> {
    if (this.closed || !this.initiator) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.handlers.onSignal({ kind: 'sdp', sdp: { type: 'offer', sdp: offer.sdp ?? '' } });
  }

  private async restartIce(): Promise<void> {
    if (this.closed || !this.initiator || this.restartingIce) return;
    this.restartingIce = true;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      this.handlers.onSignal({ kind: 'sdp', sdp: { type: 'offer', sdp: offer.sdp ?? '' } });
    } catch {
      // Соединение уже закрыто — таймер обрыва доведёт дело до конца.
    } finally {
      this.restartingIce = false;
    }
  }

  /** Сигнал от этого собеседника. Порядок тот же, что у звонка один на один. */
  async handleSignal(signal: ChatCallSignal): Promise<void> {
    if (this.closed) return;
    if (signal.kind === 'sdp') {
      const decision = decideSdpApply(
        signal.sdp.type,
        this.pc.signalingState as SignalingState,
      );
      if (decision !== 'apply') return;
      const isOffer = signal.sdp.type === 'offer';
      if (isOffer) this.answerInFlight = true;
      await this.pc.setRemoteDescription(signal.sdp);
      this.remoteSet = true;
      if (isOffer) {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.answerInFlight = false;
        this.handlers.onSignal({
          kind: 'sdp',
          sdp: { type: 'answer', sdp: answer.sdp ?? '' },
        });
      }
      for (const candidate of this.pending.splice(0))
        await this.pc.addIceCandidate(candidate).catch(() => undefined);
      return;
    }
    if (!signal.candidate) return;
    if (!this.remoteSet || this.answerInFlight) {
      this.pending.push(signal.candidate);
      return;
    }
    await this.pc.addIceCandidate(signal.candidate).catch(() => undefined);
  }

  /**
   * Включить/выключить свою картинку в ЭТОЙ паре. Без пересогласования:
   * видеосекция заведена при создании соединения (см. шапку класса).
   *
   * Дорожка одна на всю комнату — камера захватывается один раз в
   * провайдере и раздаётся во все соединения, как и микрофон. Поэтому
   * `null` здесь дорожку НЕ останавливает: её остановка — дело провайдера,
   * иначе выход одного собеседника гасил бы камеру для остальных.
   */
  async setVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    if (this.closed) return;
    try {
      await this.videoSender.replaceTrack(track);
    } catch {
      // Соединение уже закрывается — следующий пересчёт состава уберёт его.
    }
  }

  /**
   * Потолок качества исходящего видео (`group-video-quality.ts`). Ставится
   * на каждое изменение состава: втроём кодировать приходится дважды, и
   * потолок пары здесь означал бы удвоенный трафик и нагрев.
   * `setParameters` меняет параметры кодера без пересогласования SDP —
   * собеседнику ничего не приходит.
   */
  async applyVideoEncoding(target: VideoEncoding): Promise<void> {
    if (this.closed) return;
    try {
      const params = this.videoSender.getParameters() as SenderParameters;
      const next = withVideoEncoding(params, target);
      if (!next) return;
      await this.videoSender.setParameters(next);
    } catch {
      // Параметры не приняли — картинка просто останется как есть.
    }
  }

  /** Уровень входящего звука этого собеседника — для подписи «говорит». */
  async audioLevel(): Promise<number> {
    if (this.closed) return 0;
    try {
      const stats = (await this.pc.getStats()) as unknown as Iterable<StatsEntry>;
      return remoteAudioLevel(stats);
    } catch {
      return 0;
    }
  }

  /** Уровень СВОЕГО микрофона — отчёт один и тот же, запись другая. */
  async ownAudioLevel(): Promise<number> {
    if (this.closed) return 0;
    try {
      const stats = (await this.pc.getStats()) as unknown as Iterable<StatsEntry>;
      return localAudioLevel(stats);
    } catch {
      return 0;
    }
  }

  /**
   * Закрыть ЭТО соединение. Локальный поток здесь не трогается специально
   * (см. шапку класса): он общий на всю комнату и живёт в провайдере.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearDisconnectTimer();
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }

  private armDisconnectTimer(): void {
    if (this.disconnectTimer) return;
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null;
      if (!this.closed && this.pc.connectionState !== 'connected')
        this.handlers.onStateChange('failed');
    }, DISCONNECT_GRACE_MS);
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }
}
