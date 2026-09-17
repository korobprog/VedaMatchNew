import { mediaDevices, MediaStream, RTCPeerConnection } from 'react-native-webrtc';
import type { ChatCallKind, ChatCallSignal, ChatIceServerDto } from '@vedamatch/shared';
import { describeIceServerForLog, normalizeIceServers } from './ice-server-normalize';
import { parseCandidate } from './ice-probe';
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
  /** Счётчик реально отправленных кандидатов — только для диагностики живой
   *  проверки BUG A (VED-222), см. комментарий у `onicecandidate` ниже. */
  private sentCandidates = 0;
  /** Между `setRemoteDescription(offer)` и `setLocalDescription(answer)` —
   *  см. `handleSignal` (BUG C, VED-222): пока true, кандидаты собеседника
   *  (и уже накопленные, и вновь пришедшие) не применяются сразу, а ждут в
   *  `pending`. */
  private answerInFlight = false;

  constructor(
    iceServers: ChatIceServerDto[],
    private readonly role: 'caller' | 'callee',
    private readonly handlers: SessionHandlers,
  ) {
    // `iceCandidatePoolSize` НЕ ставим (было `2`, убрано на прошлом круге
    // живой проверки — react-native-webrtc/libwebrtc на Android пре-гатерит
    // пул сразу в конструкторе, до первого `setLocalDescription`, и не
    // успевает STUN/TURN за отведённые ~500-600мс).
    //
    // `continualGatheringPolicy: 'gather_continually'` (BUG C, живая
    // проверка @b992e50a) — настоящая причина «только host»: буферизация
    // кандидатов до своего `setLocalDescription` (§12.20, ниже в
    // `handleSignal`) не помогла — в одной сети с собеседником рабочая пара
    // становится writable через миллисекунды после SLD, раньше, чем
    // STUN/TURN успевают ответить. У libwebrtc `P2PTransportChannel` при
    // умолчании `GATHER_ONCE` `MaybeStopPortAllocatorSessions` останавливает
    // сбор, как только появляется ХОТЬ ОДНА writable-пара, — не важно, когда
    // именно вызван `addIceCandidate` относительно `setLocalDescription`.
    // Подтверждено экспериментом в `ice-probe-runner.ts#runAnswererProbe`:
    // ранний РЕАЛЬНЫЙ кандидат — только `host`; ранний ЗАВЕДОМО
    // НЕДОСТИЖИМЫЙ (TEST-NET) кандидат — честно `host`+`srflx`+`relay` (пара
    // никогда не становится writable, стоп-условию не сработать).
    // `gather_continually` — «приватный» ключ у `WebRTCModule.java`
    // (`parseRTCConfiguration`, парсит), но не объявлен в опубликованных
    // типах пакета (`RTCConfiguration` в `lib/typescript/RTCPeerConnection.d.ts`
    // его не содержит) — задан через расширяемый тип и приведён `as` только
    // на границе конструктора ниже, не общим `any` по файлу.
    //
    // Формат `iceServers` (BUG C, предыдущий круг живой проверки): сервер
    // (`GET /chat/calls/ice-servers`) кладёт TURN тремя URL-схемами
    // транспорта в ОДИН объект `urls` — валидно по спецификации, но
    // react-native-webrtc/libwebrtc на этом же телефоне не собирал по нему
    // ни srflx, ни relay. `ice-probe-runner.ts` (этап 0), который на ЭТОМ ЖЕ
    // телефоне уверенно получал relay, всегда строил `RTCIceServer` с ОДНИМ
    // URL на запись (`ice-probe.ts#buildProbePlan`) — `normalizeIceServers`
    // (`ice-server-normalize.ts`, свой спек) делает то же самое для обычного
    // звонка: разворачивает многосхемную запись в плоский список по одному
    // URL на `RTCIceServer`, сохраняя `username`/`credential` только у
    // `turn:`/`turns:`.
    const normalized = normalizeIceServers(iceServers);
    // eslint-disable-next-line no-console -- диагностика живой проверки
    // BUG C (VED-222): реально переданная конфигурация без секретов — число
    // серверов, схема/транспорт/факт учётки на каждый; `iceTransportPolicy`/
    // `bundlePolicy` не переопределяются (умолчания платформы —
    // `RTCConfiguration` их и так не получает), `continualGatheringPolicy` —
    // теперь `gather_continually`.
    console.warn('[calls] RTCPeerConnection: конфигурация iceServers', {
      count: normalized.length,
      servers: normalized.map(describeIceServerForLog),
      iceTransportPolicy: 'не переопределён (умолчание платформы)',
      bundlePolicy: 'не переопределён (умолчание платформы)',
      continualGatheringPolicy: 'gather_continually',
    });
    // Явный объект конфигурации — только эти ключи, ничего больше не
    // просачивается сюда случайно из будущих правок. Глубокая копия через
    // JSON (не просто `{...config}`) — по прямой просьбе координатора
    // (живая проверка BUG C): `normalized` собран `normalizeIceServers`
    // заново (не кусок React-стейта/`iceRef`), но JSON-круг гарантирует
    // простые объекты/массивы без Proxy/заморозки/лишних прототипов,
    // какими бы они ни оказались, — так конструктор `RTCPeerConnection`
    // точно получает то же самое, что видно в логе ниже, а не что-то, что
    // могло не пережить сериализацию через нативный мост незамеченным.
    const config: { iceServers: ReturnType<typeof normalizeIceServers>; continualGatheringPolicy: string } = {
      iceServers: normalized,
      continualGatheringPolicy: 'gather_continually',
    };
    const clonedConfig = JSON.parse(JSON.stringify(config)) as typeof config;
    // eslint-disable-next-line no-console -- диагностика живой проверки
    // BUG C: дословно то, что уходит в `new RTCPeerConnection(...)`, без
    // username/credential — `react-native-webrtc` не даёт прочитать назад,
    // что реально дошло до натива (`getConfiguration()` в его
    // `RTCPeerConnection` не реализован, проверено по исходнику пакета), это
    // ближайшая замена: если натив получит не то же самое, что здесь
    // залогировано, значит потерялось именно на мосте, не в этом коде.
    console.warn(
      '[calls] RTCPeerConnection: дословная конфигурация (без секретов)',
      JSON.stringify(clonedConfig, (key, value) =>
        key === 'username' || key === 'credential' ? '<redacted>' : value,
      ),
    );
    this.pc = new RTCPeerConnection(clonedConfig as ConstructorParameters<typeof RTCPeerConnection>[0]);

    this.pc.onicecandidate = ((event: IceCandidateEvent) => {
      const c = event.candidate;
      // eslint-disable-next-line no-console -- диагностика живой проверки
      // BUG A (VED-222): тип кандидата и счётчик отправленных, без адреса —
      // в logcat релиза видно как `W ReactNativeJS`.
      if (c) {
        this.sentCandidates += 1;
        console.warn('[calls] local ICE candidate', {
          type: parseCandidate(c.candidate)?.type ?? 'unknown',
          sent: this.sentCandidates,
        });
      } else {
        console.warn('[calls] local ICE gathering: конец сбора (candidate=null)', {
          sent: this.sentCandidates,
        });
      }
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

  /**
   * Сигнал от второй стороны: offer/answer или кандидат.
   *
   * BUG C (VED-222, живая проверка @7e7dac2c — детерминированный вывод):
   * раньше буфер `pending` сбрасывался в `addIceCandidate` СРАЗУ после
   * `setRemoteDescription`, ещё ДО `createAnswer`/`setLocalDescription` —
   * для ответчика (наш случай при входящем) это значит, что кандидаты
   * собеседника (обычно уже накопившиеся: сайт шлёт их пачкой следом за
   * offer) применялись, пока `setLocalDescription` этого самого ответа ещё
   * даже не вызывался. Когда среди них оказывался кандидат в той же
   * локальной сети (LAN/один Wi-Fi — как раз сценарий всех живых проверок
   * этого этапа), ICE-агент почти мгновенно находил рабочую пару и
   * `onIceGatheringChange` уходил в `COMPLETE` за считанные миллисекунды —
   * ОДИН host и всё, ни срцелях, ни relay даже не пытались собраться:
   * `runAnswererProbe` в `ice-probe-runner.ts` воспроизводит именно этот
   * порядок (`applyRemoteCandidateBeforeAnswer`) и даёт тот же паттерн
   * («host, sent:1» и конец сбора за миллисекунды вместо честного
   * таймаута) — то же самое видно и на реальном звонке в этой же LAN.
   * Правка: применять буферизованные и вновь пришедшие кандидаты ТОЛЬКО
   * ПОСЛЕ того, как наш `setLocalDescription` (ответ) уже стоит —
   * `answerInFlight` буферизует и живые (не только исходно накопленные до
   * `remoteSet`) кандидаты, пока это окно открыто, потому что сигналы
   * приходят по одному событию каждый и не гарантированно ждут друг друга
   * (`call-provider.tsx`: `void session.handleSignal(...)` без ожидания
   * предыдущего вызова).
   *
   * ЧЕСТНО (следующая живая проверка, @b992e50a): эта буферизация сама по
   * себе НЕ была настоящей причиной — реальный звонок в той же сети
   * продолжал собирать только `host` и после неё. Кандидат от собеседника
   * доходит через миллисекунды после `setLocalDescription` в любом случае,
   * а `P2PTransportChannel` (libwebrtc) при `GATHER_ONCE` останавливает
   * сбор при первой writable-паре независимо от порядка вызовов JS —
   * настоящее исправление ниже, в конструкторе
   * (`continualGatheringPolicy: 'gather_continually'`). Буферизация тут
   * оставлена — она не мешает и логически всё равно правильнее (кандидаты
   * до применения `setRemoteDescription` добавлять и правда рано), просто
   * недостаточна сама по себе.
   */
  async handleSignal(signal: ChatCallSignal): Promise<void> {
    if (this.closed) return;
    if (signal.kind === 'sdp') {
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
    if (!signal.candidate) return; // конец сбора у собеседника
    if (!this.remoteSet || this.answerInFlight) {
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
