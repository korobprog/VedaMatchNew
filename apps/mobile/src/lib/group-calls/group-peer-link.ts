import { MediaStream, MediaStreamTrack, RTCPeerConnection } from 'react-native-webrtc';
import type { ChatCallSignal, ChatIceServerDto } from '@vedamatch/shared';
import { normalizeIceServers } from '@/lib/calls/ice-server-normalize';
import {
  withVideoEncoding,
  type SenderParameters,
  type VideoEncoding,
} from '@/lib/calls/video-encoding';
import { decideSdpApply, type SignalingState } from '@/lib/calls/webrtc-signal-guard';
import {
  mergeRemoteTrack,
  pickVideoTransceiver,
  videoStatsDigest,
  type PeerVideoDiagnostics,
  type VideoStatsEntry,
} from './group-video-link';
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
 * Заводит видеосекцию только ИНИЦИАТОР пары. Отвечающий берёт ту, что
 * создал пришедший offer, и открывает ей отдачу до answer'а: свой
 * заранее заведённый трансивер к offer'у не присоединяется (JSEP 5.10), и
 * камера отвечающего уходила бы в никуда. Картинка собеседника собирается
 * из самой дорожки, а не из `event.streams` — у видеосекции без потока он
 * пуст. Обе ловушки и почему они давали чёрную плитку при живом звуке —
 * в шапке `group-video-link.ts`.
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
  track: MediaStreamTrack | null;
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

/** Трансивер видеосекции — только то, что попадает в сводку диагностики. */
interface VideoTransceiverView {
  mid: string | null;
  direction: string;
  currentDirection: string | null;
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
  /**
   * Отправитель видеосекции — см. шапку класса. У отвечающего `null`, пока
   * не пришёл offer: его видеосекцию создаёт offer.
   */
  private videoSender: VideoSender | null = null;
  /** Трансивер той же секции — ради сводки диагностики. */
  private videoTransceiver: VideoTransceiverView | null = null;
  /**
   * Что должно стоять в отправителе и каким качеством. Запоминаем, потому
   * что у отвечающего отправителя до offer'а нет, а провайдер отдаёт камеру
   * и потолок качества сразу при создании пары.
   */
  private wantedVideoTrack: MediaStreamTrack | null = null;
  private wantedEncoding: VideoEncoding | null = null;
  /** Чужие дорожки, из которых собрана картинка (`mergeRemoteTrack`). */
  private remoteTracks: MediaStreamTrack[] = [];
  /** Поток-обёртка над чужой видеодорожкой — его `toURL()` берёт `RTCView`. */
  private remoteVideo: MediaStream | null = null;

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

    this.pc.ontrack = ((event: TrackEvent) => this.onTrack(event)) as typeof this.pc.ontrack;

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
    // Пустая видеосекция заводится сразу, но только у инициатора — см.
    // шапку класса. Направление `sendrecv`: кто из пары включит камеру
    // первым, заранее неизвестно. Поток — тот же, что у микрофона: так
    // видеодорожка приезжает к собеседнику в одном потоке со звуком, и её
    // покажет даже приложение без этой починки (оно берёт `streams[0]`).
    // `streamIds`, а не `streams`: библиотека сама превращает `streams` в
    // `streamIds`, но и объекты потоков оставляет в том же `init`, который
    // уходит через мост целиком. Строки через мост проходят гарантированно.
    if (initiator) {
      const transceiver = this.pc.addTransceiver('video', {
        direction: 'sendrecv',
        streamIds: [localStream.id],
      });
      this.videoSender = transceiver.sender as unknown as VideoSender;
      this.videoTransceiver = transceiver;
    }
    handlers.onStateChange('connecting');
  }

  /**
   * Чужая дорожка. Картинку собираем из `event.track`, а не из
   * `event.streams[0]`: у видеосекции без потока он пуст, и прежний код
   * выбрасывал видео, отдавая плитке поток звука (чёрная плитка).
   *
   * Звук в поток не берём: на Android его играет сам WebRTC, без привязки
   * к потоку и без `RTCView`.
   */
  private onTrack(event: TrackEvent): void {
    if (this.closed) return;
    const next = mergeRemoteTrack(this.remoteTracks, event.track, ['video']);
    if (!next) return;
    this.remoteTracks = next;
    const previous = this.remoteVideo;
    this.remoteVideo = new MediaStream(next);
    releaseWrapper(previous);
    this.handlers.onRemoteStream(this.remoteVideo);
  }

  /**
   * Отвечающий: взять видеосекцию, созданную offer'ом, и открыть ей отдачу.
   * Вызывается между `setRemoteDescription(offer)` и `createAnswer`, иначе
   * answer уйдёт `recvonly` и наша камера до собеседника не дойдёт.
   */
  private adoptVideoTransceiver(): void {
    if (this.initiator) return;
    const transceivers = this.pc.getTransceivers();
    const pick = pickVideoTransceiver(
      transceivers.map((t) => ({
        kind: t.receiver.track?.kind,
        mid: t.mid,
        stopped: t.stopped,
        direction: t.direction,
      })),
    );
    if (!pick) return;
    const transceiver = transceivers[pick.index];
    if (pick.setDirection) transceiver.direction = pick.setDirection;
    this.videoTransceiver = transceiver;
    const sender = transceiver.sender as unknown as VideoSender;
    if (this.videoSender === sender) return;
    this.videoSender = sender;
    // Камеру и потолок качества провайдер отдал, когда отправителя ещё не
    // было, — применяем запомненное.
    void this.pushVideoTrack();
    if (this.wantedEncoding) void this.applyVideoEncoding(this.wantedEncoding);
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
        this.adoptVideoTransceiver();
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
    this.wantedVideoTrack = track;
    await this.pushVideoTrack();
  }

  private async pushVideoTrack(): Promise<void> {
    if (this.closed || !this.videoSender) return;
    try {
      await this.videoSender.replaceTrack(this.wantedVideoTrack);
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
    this.wantedEncoding = target;
    if (this.closed || !this.videoSender) return;
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
      return remoteAudioLevel(await this.statsEntries<StatsEntry>());
    } catch {
      return 0;
    }
  }

  /** Уровень СВОЕГО микрофона — отчёт один и тот же, запись другая. */
  async ownAudioLevel(): Promise<number> {
    if (this.closed) return 0;
    try {
      return localAudioLevel(await this.statsEntries<StatsEntry>());
    } catch {
      return 0;
    }
  }

  /**
   * Записи `getStats()`. react-native-webrtc отдаёт отчёт как `Map`
   * (`new Map(JSON.parse(data))`), а обход `Map` даёт пары `[id, запись]`,
   * не записи: разбор по `type` такие пары не узнаёт, и подпись «говорит»
   * не загоралась никогда. Поэтому значения берём явно.
   */
  private async statsEntries<T>(): Promise<T[]> {
    const report = (await this.pc.getStats()) as unknown as Map<string, T>;
    return [...report.values()];
  }

  /**
   * Что пара знает о своём видео — для скрытой сводки на экране звонка
   * (`formatVideoDiagnostics`). Без имён и id собеседника.
   */
  async videoDiagnostics(): Promise<PeerVideoDiagnostics> {
    let stats: VideoStatsEntry[] = [];
    if (!this.closed) {
      try {
        stats = await this.statsEntries<VideoStatsEntry>();
      } catch {
        // Статистики нет — сводка так и скажет.
      }
    }
    const t = this.videoTransceiver;
    return {
      initiator: this.initiator,
      connectionState: this.closed ? 'closed' : String(this.pc.connectionState),
      transceiver: t
        ? {
            mid: t.mid ?? null,
            direction: t.direction ?? null,
            current: t.currentDirection ?? null,
          }
        : null,
      sendingTrack: Boolean(this.videoSender && this.wantedVideoTrack),
      remoteTrack: this.remoteTracks.length > 0,
      stats: videoStatsDigest(stats),
    };
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
    // Обёртку отпускаем ДО закрытия соединения: пока оно живо, нативная
    // сторона ещё находит чужую дорожку и вынимает её из обёртки, а не
    // уничтожает вместе с ней (`releaseWrapper`).
    releaseWrapper(this.remoteVideo);
    this.remoteVideo = null;
    this.remoteTracks = [];
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

/**
 * Отпустить нативный поток-обёртку, НЕ трогая дорожки: они принадлежат
 * соединению. `release(false)` сперва вынимает дорожки из потока и только
 * потом уничтожает его — нативный `MediaStream.dispose()` уничтожил бы и
 * всё, что в нём осталось.
 */
function releaseWrapper(stream: MediaStream | null): void {
  if (!stream) return;
  try {
    stream.release(false);
  } catch {
    // Уже отпущен — делать нечего.
  }
}
