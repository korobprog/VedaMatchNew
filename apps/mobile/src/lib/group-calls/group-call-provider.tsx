import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import {
  mediaDevices,
  type MediaStream,
  type MediaStreamTrack,
} from 'react-native-webrtc';
import type {
  ChatCallSignal,
  ChatGroupCallDto,
  ChatIceServerDto,
  ChatStreamEvent,
} from '@vedamatch/shared';
import type { NetworkTransport } from '../../../modules/vedamatch-calls';
import type { VideoEncoding } from '@/lib/calls/video-encoding';
import { useSession } from '@/lib/auth/session';
import { useChatStream } from '@/lib/chat/chat-stream';
import { ApiError } from '@/lib/api/client';
import { createChatCallsApi } from '@/lib/calls/chat-calls-client';
import { describeMediaError } from '@/lib/calls/call-media-error';
import {
  buildMediaSignal,
  readMediaSignal,
  shouldAnnounceMedia,
} from '@/lib/calls/media-state-signal';
import {
  setPipEligible,
  subscribeToNetworkTransportChanges,
  subscribeToPipModeChanges,
} from '@/lib/calls/native-call-bridge';
import {
  admitCallSignal,
  INITIAL_SIGNAL_SEQ_STATE,
  type SignalSeqState,
} from '@/lib/calls/call-signal-catchup';
import { sendWithRetry } from '@/lib/calls/call-signal-retry';
import { SignalSendQueue } from '@/lib/calls/call-signal-send-queue';
import { GroupCallBanner } from '@/components/calls/group-call-banner';
import { createGroupCallsApi } from './group-call-client';
import { GroupCallsContext, type GroupCallsApi } from './group-call-context';
import {
  GROUP_CALL_HEARTBEAT_MS,
  HEARTBEAT_LOST_MESSAGE,
  heartbeatLost,
} from './group-call-heartbeat';
import { planPeers } from './group-call-peers';
import {
  IDLE_GROUP_CALL_STATE,
  reduceGroupCall,
  type GroupCallState,
} from './group-call-state';
import {
  degradationFor,
  encodingChanged,
  groupScreenEncoding,
  groupVideoEncoding,
} from './group-video-quality';
import type { DegradationPreference } from '@/lib/calls/video-encoding';
import { formatVideoDiagnostics } from './group-video-link';
import { outgoingVideo } from './group-video-state';
import {
  cameraToggleNeedsServer,
  canShareScreen,
  describeScreenShareError,
  SCREEN_CAPTURE_SCALE,
  screenButtonState,
  screenFlagStale,
  screenStopPatch,
} from './screen-share';
import { GroupPeerLink } from './group-peer-link';
import {
  EMPTY_SPEAKING_STATE,
  nextSpeakingState,
  speakingIds,
  type SpeakingState,
} from './speaking-state';

/**
 * Провайдер групповых звонков (VED-293, этап 1 — аудио до четырёх человек).
 *
 * Устроен как расширение звонка один на один, а не как второй механизм:
 * тот же поток событий `chat-stream.tsx`, те же TURN-учётки
 * (`GET /chat/calls/ice-servers`), та же очередь и дедупликация сигналов
 * (`call-signal-*.ts`), тот же `webrtc-signal-guard`. Разница ровно в
 * двух местах, и обе — следствие mesh'а:
 *
 * 1. Соединение не одно, а по одному на каждого собеседника
 *    (`Map<userId, GroupPeerLink>`). План — `group-call-peers.ts`: позже
 *    вошедший шлёт offer всем, кто уже был.
 * 2. Микрофон захватывается ОДИН раз на всю комнату и раздаётся во все
 *    соединения. Выход одного собеседника закрывает его соединение, но не
 *    трогает поток — иначе микрофон замолчал бы для остальных.
 *
 * Отдельный провайдер, а не ветка внутри `call-provider.tsx`: смешивать
 * состояние «один звонок, две роли» и «комната, до шести соединений» в
 * одном редьюсере — верный способ сломать работающий звонок один на один,
 * а его сейчас правят в другой ветке (#436, видеозвонки).
 *
 * Чистая часть — `group-call-state.ts` (что показывать),
 * `group-call-peers.ts` (кто с кем соединяется), `speaking-state.ts` (кто
 * говорит); всё со своими спеками. Сам провайдер — склейка вокруг
 * нативного WebRTC и потому не тестируется, по тому же правилу, что и
 * `call-provider.tsx`.
 */

/** Как часто опрашиваем уровни звука для подписи «говорит». */
const SPEAKING_POLL_MS = 400;

export function GroupCallProvider({ children }: { children: ReactNode }) {
  const { status, api, user } = useSession();
  const stream = useChatStream();
  const groupApi = useMemo(() => createGroupCallsApi(api), [api]);
  const callsApi = useMemo(() => createChatCallsApi(api), [api]);
  const userId = user?.id ?? '';

  const [state, dispatch] = useReducer(reduceGroupCall, IDLE_GROUP_CALL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Комнаты, идущие в беседах, — для плашки «идёт звонок». */
  const [roomsByConversation, setRoomsByConversation] = useState<
    Record<string, ChatGroupCallDto>
  >({});
  const [screenVisible, setScreenVisible] = useState(false);

  const links = useRef(new Map<string, GroupPeerLink>());
  const localStream = useRef<MediaStream | null>(null);
  /**
   * Камера (VED-293, этап 4). Отдельно от `localStream`: микрофон
   * захватывается один раз на весь звонок, а камера включается и гаснет по
   * ходу — по кнопке и при уходе приложения в фон. Держать её дорожку
   * внутри общего потока значило бы либо не гасить её вовсе, либо каждый
   * раз пересобирать поток микрофона.
   */
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  /**
   * Тот же захват потоком: `RTCView` показывает картинку по `toURL()`
   * потока, а не дорожки. Состоянием, а не `ref`: появление своей картинки
   * обязано перерисовать сетку.
   */
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  /** Человек хочет камеру включённой. Что реально уходит — `outgoingVideo`. */
  const [cameraOn, setCameraOn] = useState(false);
  /**
   * Показ экрана (VED-360): экран подменяет камеру в том же отправителе.
   * `cameraOn` при этом не трогается — это то, вернётся ли камера, когда
   * показ кончится.
   */
  const [screenOn, setScreenOn] = useState(false);
  /** Свой экран потоком — для своей плитки, пока показываем. */
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  /**
   * Показ, который уже кончился, но чья дорожка ещё стоит в отправителях.
   * Отпускается нативно (`release`) только после того, как отправители
   * получили замену: освобождённая дорожка в живом отправителе — это
   * обращение к уничтоженному нативному объекту.
   */
  const screenToRelease = useRef<MediaStream | null>(null);
  /** Идёт запрос начала показа — `screenFlagStale` в это окно не чинит. */
  const screenPending = useRef(false);
  const screenSupported = canShareScreen({ os: Platform.OS, version: Platform.Version });
  /** Чужие потоки: из них экран берёт картинку. */
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  /** Кто сообщил `{kind:'media'}`, что сейчас не снимает. */
  const [remoteVideoOff, setRemoteVideoOff] = useState<Record<string, boolean>>({});
  const [pipActive, setPipActive] = useState(false);
  const [appStateValue, setAppStateValue] = useState<AppStateStatus>(() =>
    AppState.currentState === 'background' ? 'background' : 'active',
  );
  const videoTransport = useRef<NetworkTransport | null>(null);
  /** Последнее применённое качество — чтобы не дёргать нативный мост впустую. */
  const appliedEncoding = useRef<VideoEncoding | null>(null);
  const appliedDegradation = useRef<DegradationPreference | null>(null);
  /** Что мы в последний раз сообщили о своей камере каждому собеседнику. */
  const announcedMedia = useRef(new Map<string, boolean>());

  /**
   * Что уходит в видео-отправитель — экран, камера или ничего — решает
   * чистый `outgoingVideo` (`group-video-state.ts`), а не разбросанные по
   * провайдеру условия. `ref` рядом нужен обработчикам, которые вызываются
   * вне рендера (создание нового соединения из пришедшего offer).
   */
  const outgoing = outgoingVideo({
    phase: state.phase,
    cameraOn,
    screenOn,
    appState: normalizeAppState(appStateValue),
    pipActive,
  });
  const sendingVideo = outgoing !== null;
  const outgoingRef = useRef(outgoing);
  const sendingVideoRef = useRef(sendingVideo);
  const cameraOnRef = useRef(cameraOn);
  const screenOnRef = useRef(screenOn);
  // Через эффект, а не прямо в теле: запись в `ref` во время отрисовки —
  // та же ошибка, из-за которой рядом так же синхронизируется `stateRef` в
  // веб-провайдере. Читают эти `ref` только обработчики вне отрисовки, и
  // они срабатывают уже после эффектов.
  useEffect(() => {
    outgoingRef.current = outgoing;
    sendingVideoRef.current = sendingVideo;
    cameraOnRef.current = cameraOn;
    screenOnRef.current = screenOn;
  }, [cameraOn, outgoing, screenOn, sendingVideo]);
  /** Сколько людей в комнате — потолок качества пересчитывается и по нему. */
  const participantCount = useRef(0);

  /** Дорожка, которая сейчас должна стоять в отправителях. */
  const currentVideoTrack = useCallback(
    (): MediaStreamTrack | null =>
      outgoingRef.current === 'screen'
        ? screenTrack.current
        : outgoingRef.current === 'camera'
          ? cameraTrack.current
          : null,
    [],
  );
  const iceServers = useRef<ChatIceServerDto[]>([]);
  const sendQueue = useRef(new SignalSendQueue());
  const seqState = useRef<SignalSeqState>(INITIAL_SIGNAL_SEQ_STATE);
  const speaking = useRef<SpeakingState>(EMPTY_SPEAKING_STATE);
  /** Подряд не дошедшие подтверждения присутствия — см. `group-call-heartbeat.ts`. */
  const heartbeatFailures = useRef(0);

  // ---------- сигналинг ----------

  const sendSignal = useCallback(
    (callId: string, toUserId: string, signal: ChatCallSignal) => {
      const clientSignalId = randomUUID();
      void sendQueue.current.enqueue(() =>
        sendWithRetry(() =>
          groupApi.signal(callId, toUserId, signal, clientSignalId),
        ),
      );
    },
    [groupApi],
  );

  const linkFor = useCallback(
    (callId: string, peerId: string, initiator: boolean): GroupPeerLink | null => {
      const existing = links.current.get(peerId);
      if (existing) return existing;
      const stream = localStream.current;
      if (!stream) return null;
      const link = new GroupPeerLink(peerId, iceServers.current, initiator, stream, {
        onSignal: (signal) => sendSignal(callId, peerId, signal),
        onRemoteStream: (remote) => {
          // Звук играет сам через нативный аудиовыход WebRTC — отдельный
          // элемент воспроизведения нужен только вебу
          // (`remote-audio-playback.ts`). Сюда приходит обёртка над ЧУЖОЙ
          // ВИДЕОДОРОЖКОЙ (`GroupPeerLink.onTrack`), а не поток звука: её
          // `toURL()` и показывает `RTCView`.
          setRemoteStreams((streams) => ({ ...streams, [peerId]: remote }));
        },
        onStateChange: (peerState) => {
          dispatch({ type: 'peer-state', userId: peerId, state: peerState });
          // Связь встала (в том числе заново после перезапуска ICE) —
          // сообщаем своё состояние камеры ещё раз: прошлый сигнал мог не
          // дойти, а молчание собеседник считает за «камера снимает».
          if (peerState === 'connected') announcedMedia.current.delete(peerId);
        },
      });
      links.current.set(peerId, link);
      // Новому соединению сразу отдаём и картинку (камеру или экран), и
      // потолок качества: без этого вошедший четвёртым видел бы чёрные
      // плитки до первого изменения состава.
      void link.setVideoTrack(currentVideoTrack());
      if (appliedEncoding.current)
        void link.applyVideoEncoding(
          appliedEncoding.current,
          appliedDegradation.current ?? undefined,
        );
      return link;
    },
    [currentVideoTrack, sendSignal],
  );

  /**
   * Потолок качества по составу комнаты (`group-video-quality.ts`).
   * Пересчитывается и на вход, и на выход: втроём телефон кодирует кадр
   * дважды, а разошлись — картинка обязана вернуться, а не доживать
   * разговор на 360p.
   */
  const applyVideoQuality = useCallback((count: number) => {
    participantCount.current = count;
    // Экрану — свой потолок: кадр не уменьшается, падает частота
    // (`groupScreenEncoding`). Пересчёт идёт и на смену источника.
    const source = outgoingRef.current === 'screen' ? 'screen' : 'camera';
    const target =
      source === 'screen'
        ? groupScreenEncoding(videoTransport.current, count)
        : groupVideoEncoding(videoTransport.current, count);
    const degradation = degradationFor(source);
    if (
      !encodingChanged(appliedEncoding.current, target) &&
      appliedDegradation.current === degradation
    )
      return;
    appliedEncoding.current = target;
    appliedDegradation.current = degradation;
    for (const link of links.current.values())
      void link.applyVideoEncoding(target, degradation);
  }, []);

  const closeLink = useCallback((peerId: string) => {
    links.current.get(peerId)?.close();
    links.current.delete(peerId);
    announcedMedia.current.delete(peerId);
    // Чужой поток и его «камера выключена» уходят вместе с соединением:
    // иначе плитка вышедшего осталась бы висеть с последним кадром.
    setRemoteStreams((streams) => {
      if (!(peerId in streams)) return streams;
      const next = { ...streams };
      delete next[peerId];
      return next;
    });
    setRemoteVideoOff((off) => {
      if (!(peerId in off)) return off;
      const next = { ...off };
      delete next[peerId];
      return next;
    });
  }, []);

  const closeAllLinks = useCallback(() => {
    for (const link of links.current.values()) link.close();
    links.current.clear();
    announcedMedia.current.clear();
  }, []);

  /**
   * Привести соединения в соответствие составу комнаты. Вызывается на
   * каждое изменение состава — и на вход, и на выход: mesh перестраивается
   * по ходу, а не собирается один раз.
   */
  const reconcilePeers = useCallback(
    (call: ChatGroupCallDto) => {
      if (!localStream.current) return;
      const plan = planPeers(call, userId, [...links.current.keys()]);
      for (const gone of plan.gone) closeLink(gone);
      for (const peerId of plan.added) {
        const initiator = plan.offerTo.includes(peerId);
        const link = linkFor(call.id, peerId, initiator);
        if (link && initiator) void link.makeOffer();
      }
      // Состав изменился — потолок качества считается заново. И на вход, и
      // на выход: разошлись — картинка обязана вернуться.
      applyVideoQuality(call.participants.length);
    },
    [applyVideoQuality, closeLink, linkFor, userId],
  );

  const applySignal = useCallback(
    async (fromUserId: string, seq: number | undefined, signal: ChatCallSignal) => {
      const admission = admitCallSignal(seqState.current, seq);
      seqState.current = admission.next;
      if (!admission.admit) return;
      const call = stateRef.current.call;
      if (!call) return;
      // Соединения с этим человеком ещё нет — значит offer пришёл раньше,
      // чем до нас доехал новый состав комнаты. Поднимаем отвечающую
      // сторону сразу: ждать события `group-call.updated` значит терять
      // offer, ровно как это было в VED-261 у звонка один на один.
      // «Моя камера сейчас не снимает» — не для WebRTC, а для плитки
      // собеседника (`media-state-signal.ts`). Отдаём его в состояние и не
      // несём в соединение: `handleSignal` про такой вид ничего не знает.
      const media = readMediaSignal(signal);
      if (media) {
        setRemoteVideoOff((off) =>
          off[fromUserId] === !media.video
            ? off
            : { ...off, [fromUserId]: !media.video },
        );
        return;
      }
      const link = linkFor(call.id, fromUserId, false);
      await link?.handleSignal(signal);
    },
    [linkFor],
  );

  /** Дочитать пропущенное, пока поток был закрыт (фон, обрыв). */
  const catchUpSignals = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== 'active') return;
    try {
      const { signals } = await groupApi.signals(call.id, seqState.current.lastSeq);
      for (const envelope of signals)
        await applySignal(envelope.fromUserId, envelope.seq, envelope.signal);
    } catch {
      // Следующая пересинхронизация потока попробует снова.
    }
  }, [applySignal, groupApi]);

  // ---------- вход и выход ----------

  const teardown = useCallback(() => {
    closeAllLinks();
    for (const track of localStream.current?.getTracks() ?? []) track.stop();
    localStream.current = null;
    // Камера отпускает железо вместе с концом звонка — иначе индикатор
    // камеры продолжает гореть после выхода.
    cameraTrack.current?.stop();
    cameraTrack.current = null;
    setLocalVideoStream(null);
    setCameraOn(false);
    // Показ экрана кончается вместе со звонком. Соединения уже закрыты, так
    // что дорожку можно отпустить сразу: `release` останавливает захват и
    // гасит службу показа вместе с её уведомлением.
    releaseScreen(screenStream.current);
    releaseScreen(screenToRelease.current);
    screenStream.current = null;
    screenToRelease.current = null;
    screenTrack.current = null;
    screenOnRef.current = false;
    screenPending.current = false;
    setLocalScreenStream(null);
    setScreenOn(false);
    setRemoteStreams({});
    setRemoteVideoOff({});
    announcedMedia.current.clear();
    appliedEncoding.current = null;
    appliedDegradation.current = null;
    speaking.current = EMPTY_SPEAKING_STATE;
    seqState.current = INITIAL_SIGNAL_SEQ_STATE;
    heartbeatFailures.current = 0;
    if (Platform.OS !== 'web') InCallManager.stop();
  }, [closeAllLinks]);

  const enterRoom = useCallback(
    async (call: ChatGroupCallDto) => {
      const { iceServers: servers } = await callsApi.iceServers();
      iceServers.current = servers;
      if (!localStream.current) {
        const media = await mediaDevices.getUserMedia({ audio: true, video: false });
        if (media.getAudioTracks().length === 0) {
          for (const track of media.getTracks()) track.stop();
          const error = new Error('Нет доступа к микрофону');
          (error as { name: string }).name = 'NotAllowedError';
          throw error;
        }
        localStream.current = media;
        if (Platform.OS !== 'web') InCallManager.start({ media: 'audio' });
      }
      heartbeatFailures.current = 0;
      dispatch({ type: 'joined', call, at: Date.now() });
      reconcilePeers(call);
      router.push(`/group-call/${call.id}`);
    },
    [callsApi, reconcilePeers],
  );

  /**
   * Вход не удался. Если комната нас уже приняла (микрофон не дали уже
   * ПОСЛЕ ответа сервера), надо выйти явно: иначе мы висим в составе у
   * остальных до истечения TTL — беззвучный и бесполезный, но занимающий
   * одно из четырёх мест. Перенесено из веб-части (VED-293, этап 2).
   */
  const failEntry = useCallback(
    (error: unknown, call: ChatGroupCallDto | null) => {
      teardown();
      dispatch({ type: 'failed', error: describeMediaError(error, Platform.OS) });
      if (call) void groupApi.leave(call.id).catch(() => undefined);
    },
    [groupApi, teardown],
  );

  const startOrJoin = useCallback(
    async (conversationId: string) => {
      if (stateRef.current.phase === 'active' || stateRef.current.phase === 'joining')
        return;
      dispatch({ type: 'joining' });
      let call: ChatGroupCallDto | null = null;
      try {
        call = await groupApi.start(conversationId);
        await enterRoom(call);
      } catch (error) {
        failEntry(error, call);
      }
    },
    [enterRoom, failEntry, groupApi],
  );

  const join = useCallback(
    async (callId: string) => {
      if (stateRef.current.phase === 'active' || stateRef.current.phase === 'joining')
        return;
      dispatch({ type: 'joining' });
      let call: ChatGroupCallDto | null = null;
      try {
        call = await groupApi.join(callId);
        await enterRoom(call);
      } catch (error) {
        failEntry(error, call);
      }
    },
    [enterRoom, failEntry, groupApi],
  );

  const leave = useCallback(async () => {
    const call = stateRef.current.call;
    teardown();
    dispatch({ type: 'left' });
    if (!call) return;
    // Выход сообщаем серверу, но экран не ждёт ответа: если сеть уже
    // пропала, человека уберёт уборщик мёртвых участников.
    try {
      await groupApi.leave(call.id);
    } catch {
      // Молча: состав всё равно пересчитает сервер.
    }
  }, [groupApi, teardown]);

  const toggleMute = useCallback(() => {
    const next = !stateRef.current.muted;
    dispatch({ type: 'toggle-mute' });
    for (const track of localStream.current?.getAudioTracks() ?? [])
      track.enabled = !next;
    const call = stateRef.current.call;
    if (call)
      void groupApi.setMuted(call.id, next).catch(() => {
        // Сервер не узнал — у остальных значок микрофона отстанет до
        // следующего heartbeat'а, звук при этом уже выключен.
      });
  }, [groupApi]);

  // ---------- камера ----------

  /**
   * Включить или выключить камеру. Решение принимает СЕРВЕР: мест под видео
   * в комнате три, а участников четыре, и между «нажал» и «дошло» место мог
   * занять сосед. Поэтому порядок такой — сперва спрашиваем разрешение
   * (`POST /state`), и только получив его, трогаем камеру.
   *
   * Обратный порядок («включим, а сервер потом подтвердит») выглядел бы
   * отзывчивее и был бы неверен: четвёртый успел бы увидеть свою картинку и
   * посветить фонарём, прежде чем она погаснет, — а остальным его кадры при
   * этом не пошли бы вовсе. Честный отказ лучше мигнувшей картинки.
   *
   * Выключение сервера не спрашивает вовсе: гасим сразу, сообщаем следом.
   * Отказать в выключении своей камеры невозможно по смыслу, а ждать сети,
   * чтобы перестать снимать, — это лишние секунды работы кодера.
   */
  const toggleCamera = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== 'active') return;
    const next = !cameraOn;

    // Во время показа экрана место под видео держит экран, а камера в
    // отправитель не попадёт до конца показа. Нажатие решает только,
    // вернётся ли она потом, — сервер узнает вместе с концом показа
    // (`screenStopPatch`). `{video:false}` сейчас погасил бы показ.
    if (!cameraToggleNeedsServer(screenOnRef.current)) {
      setCameraOn(next);
      return;
    }

    if (!next) {
      setCameraOn(false);
      void groupApi.setVideo(call.id, false).catch(() => {
        // Сервер не узнал — место освободится вместе с heartbeat'ом или
        // выходом. Картинка у остальных уже погасла сигналом `media`.
      });
      return;
    }

    try {
      await groupApi.setVideo(call.id, true);
    } catch (error) {
      // Текст отказа пришёл с сервера — показываем его, а не свой пересказ
      // правила, которое сервер вправе поменять без нас.
      dispatch({
        type: 'failed-action',
        error: describeMediaError(error, Platform.OS),
      });
      return;
    }
    setCameraOn(true);
  }, [cameraOn, groupApi]);

  /** Передняя/задняя камера. Дорожка одна на всю комнату — и переключается один раз. */
  const switchCamera = useCallback(() => {
    const track = cameraTrack.current as
      | (MediaStreamTrack & { _switchCamera?: () => void })
      | null;
    track?._switchCamera?.();
  }, []);

  /**
   * Сообщить собеседникам, снимаем ли мы сейчас (`media-state-signal.ts`,
   * перенесено из VED-291).
   *
   * Без этого свёрнутое приложение показывало бы остальным замёрзший кадр:
   * место под видео сервер держит за человеком, пока тот в звонке, а кадры
   * идти перестали. Повторов не будет — `shouldAnnounceMedia` пропускает
   * только изменившееся состояние (и всё заново после `connected`).
   */
  const announceMedia = useCallback(() => {
    const call = stateRef.current.call;
    if (!call) return;
    for (const peerId of links.current.keys()) {
      const last = announcedMedia.current.get(peerId) ?? null;
      if (!shouldAnnounceMedia(last, sendingVideoRef.current)) continue;
      announcedMedia.current.set(peerId, sendingVideoRef.current);
      sendSignal(call.id, peerId, buildMediaSignal(sendingVideoRef.current));
    }
  }, [sendSignal]);

  /**
   * Привести отправитель в соответствие решению `outgoingVideo`: захватить
   * камеру и раздать её во все соединения, либо раздать экран, либо ничего,
   * — и сообщить собеседникам, идёт ли картинка.
   *
   * Камера именно ОСТАНАВЛИВАЕТСЯ, а не глушится `enabled = false`, в том
   * числе на время показа экрана: выключенная камера обязана отпустить
   * железо (на телефоне гаснет и индикатор), иначе экономии на батарее и
   * нагреве, ради которой всё затевалось, не будет вовсе.
   *
   * Кончившийся показ отпускается здесь же, ПОСЛЕ того как отправители
   * получили замену (`screenToRelease`).
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (outgoing === 'camera') {
        if (!cameraTrack.current) {
          // Пока камера захватывается, в отправителе не должно остаться
          // кончившегося экрана — у собеседников замёрз бы его кадр.
          await Promise.all(
            [...links.current.values()].map((link) => link.setVideoTrack(null)),
          );
          releaseScreen(screenToRelease.current);
          screenToRelease.current = null;
          try {
            const media = await mediaDevices.getUserMedia({
              audio: false,
              video: { facingMode: 'user' },
            });
            const [track] = media.getVideoTracks();
            if (!track) return;
            if (cancelled) {
              for (const t of media.getTracks()) t.stop();
              return;
            }
            cameraTrack.current = track;
            setLocalVideoStream(media);
          } catch (error) {
            // Камеру не дали — сервер про наше место знать не должен.
            if (cancelled) return;
            setCameraOn(false);
            const call = stateRef.current.call;
            if (call) void groupApi.setVideo(call.id, false).catch(() => undefined);
            dispatch({
              type: 'failed-action',
              error: describeMediaError(error, Platform.OS),
            });
            return;
          }
        }
        await Promise.all(
          [...links.current.values()].map((link) => link.setVideoTrack(cameraTrack.current)),
        );
      } else {
        const track = outgoing === 'screen' ? screenTrack.current : null;
        await Promise.all(
          [...links.current.values()].map((link) => link.setVideoTrack(track)),
        );
        cameraTrack.current?.stop();
        cameraTrack.current = null;
        setLocalVideoStream(null);
      }
      releaseScreen(screenToRelease.current);
      screenToRelease.current = null;
      // Источник сменился — потолок качества тоже: экрану нужен полный
      // кадр, камере — лестница по составу.
      applyVideoQuality(participantCount.current);
      announceMedia();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только по решению предиката
  }, [outgoing, announceMedia]);

  // ---------- показ экрана ----------

  /**
   * Закончить показ — кнопкой, «Остановить показ» в шторке, системной
   * остановкой (другое приложение забрало экран, пользователь выключил
   * трансляцию) или выходом. Камера возвращается, если была включена, иначе
   * место под видео отдаётся: серверу — одним запросом (`screenStopPatch`).
   *
   * Дорожка не отпускается здесь сразу: она ещё стоит в отправителях.
   * Отпускает её эффект выше, когда раздаст замену.
   */
  const stopScreenShare = useCallback(() => {
    const media = screenStream.current;
    if (!media && !screenOnRef.current) return;
    screenStream.current = null;
    screenTrack.current = null;
    screenOnRef.current = false;
    if (media) {
      // Предыдущий кончившийся показ, если его ещё не отпустили, отпускаем:
      // одновременно в отправителях двух экранов не бывает.
      releaseScreen(screenToRelease.current);
      screenToRelease.current = media;
    }
    setLocalScreenStream(null);
    setScreenOn(false);
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== 'active') return;
    const patch = screenStopPatch(cameraOnRef.current);
    void sendWithRetry(() => groupApi.setScreen(call.id, patch).then(() => undefined));
  }, [groupApi]);

  /**
   * Начать показ. Порядок обратный камере — сперва системное окно согласия,
   * потом разрешение сервера: окно открывается только в ответ на нажатие, а
   * сервер ответит за доли секунды. Остальные при этом ничего лишнего не
   * видят: в отправитель экран попадает только после ответа сервера, а при
   * отказе захват сразу отпускается вместе со службой показа.
   */
  const toggleScreenShare = useCallback(async () => {
    if (!screenSupported) return;
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== 'active') return;
    if (screenOnRef.current) {
      stopScreenShare();
      return;
    }
    if (screenPending.current) return;
    // Заведомый отказ (показывает другой, мест нет) объясняем сразу, не
    // открывая системное окно: согласиться и только потом услышать
    // «нельзя» обиднее.
    const hint = screenButtonState(call, userId, { sharing: false, supported: true });
    if (hint.blocked) {
      if (hint.blockedReason) dispatch({ type: 'failed-action', error: hint.blockedReason });
      return;
    }
    screenPending.current = true;
    let media: MediaStream | null = null;
    try {
      media = await mediaDevices.getDisplayMedia({
        android: { resolutionScale: SCREEN_CAPTURE_SCALE },
      });
      const [track] = media.getVideoTracks();
      if (!track) throw new Error('Не удалось показать экран');
      await groupApi.setScreen(call.id, { screen: true });
      if (stateRef.current.phase !== 'active' || stateRef.current.call?.id !== call.id) {
        // Пока ждали ответа, звонок кончился — показ отпускаем.
        releaseScreen(media);
        return;
      }
      // «Остановить показ» в шторке, системная остановка трансляции и
      // вытеснение другим приложением приходят сюда концом дорожки.
      // Сеттер, а не `addEventListener`: последнего нет в опубликованных
      // типах react-native-webrtc 124.x (см. шапку `webrtc-session.ts`).
      track.onended = () => stopScreenShare();
      screenTrack.current = track;
      screenStream.current = media;
      screenOnRef.current = true;
      setLocalScreenStream(media);
      setScreenOn(true);
    } catch (error) {
      releaseScreen(media);
      const message = describeScreenShareError(
        error,
        (e): e is Error => e instanceof ApiError,
      );
      if (message) dispatch({ type: 'failed-action', error: message });
    } finally {
      screenPending.current = false;
    }
  }, [groupApi, screenSupported, stopScreenShare, userId]);

  /**
   * Свежий состав говорит, что мы показываем, а мы уже нет — конец показа
   * до сервера не дошёл. Повторяем его (`screenFlagStale`).
   */
  const resyncScreenFlag = useCallback(
    (call: ChatGroupCallDto) => {
      if (
        !screenFlagStale(call, userId, {
          sharing: screenOnRef.current,
          pending: screenPending.current,
        })
      )
        return;
      void groupApi
        .setScreen(call.id, screenStopPatch(cameraOnRef.current))
        .catch(() => undefined);
    },
    [groupApi, userId],
  );

  useEffect(() => subscribeToPipModeChanges(setPipActive), []);

  useEffect(() => {
    return subscribeToNetworkTransportChanges((transport) => {
      videoTransport.current = transport;
      const count = stateRef.current.call?.participants.length ?? 0;
      if (count > 0) applyVideoQuality(count);
    });
  }, [applyVideoQuality]);

  /**
   * Пока идёт разговор с камерой и экран открыт, разрешаем «картинку в
   * картинке»: она единственная причина не гасить камеру в фоне
   * (`videoDimmedByBackground`). Флаг живёт на уровне Activity и с Telecom
   * не связан (`PipState.kt`), поэтому групповому экрану он доступен так
   * же, как экрану звонка один на один.
   */
  useEffect(() => {
    const eligible = state.phase === 'active' && screenVisible && cameraOn;
    setPipEligible(eligible);
    return () => setPipEligible(false);
  }, [cameraOn, screenVisible, state.phase]);

  const dismiss = useCallback(() => {
    teardown();
    dispatch({ type: 'reset' });
  }, [teardown]);

  // ---------- общий поток событий ----------

  useEffect(() => {
    if (status !== 'signed') return;
    return stream.subscribe((event: ChatStreamEvent) => {
      if (!isGroupCallEvent(event)) return;
      if (event.type === 'group-call.signal') {
        if (event.callId !== stateRef.current.call?.id) return;
        void applySignal(event.fromUserId, event.seq, event.signal);
        return;
      }

      // Плашка «идёт звонок» в беседе — это и есть «входящий групповой»:
      // телефон не звонит, в переписке появляется строка с кнопкой войти.
      setRoomsByConversation((rooms) => {
        const next = { ...rooms };
        if (event.call.status === 'live') next[event.call.conversationId] = event.call;
        else delete next[event.call.conversationId];
        return next;
      });

      dispatch({ type: 'stream', event, selfId: userId });
      if (
        stateRef.current.phase === 'active' &&
        event.call.id === stateRef.current.call?.id &&
        event.type !== 'group-call.ended'
      )
        reconcilePeers(event.call);
    });
  }, [applySignal, reconcilePeers, status, stream, userId]);

  // Поток переподключился — состав и пропущенные сигналы перечитываем.
  useEffect(() => {
    if (status !== 'signed') return;
    return stream.onResync(() => {
      const call = stateRef.current.call;
      if (!call || stateRef.current.phase !== 'active') return;
      void groupApi
        .heartbeat(call.id)
        .then((fresh) => {
          // Поток ожил — счётчик осечек начинается заново: связь с порталом
          // есть, и прошлые пропуски больше ни о чём не говорят.
          heartbeatFailures.current = 0;
          dispatch({ type: 'stream', event: { type: 'group-call.updated', call: fresh }, selfId: userId });
          reconcilePeers(fresh);
        })
        .catch(() => undefined);
      void catchUpSignals();
    });
  }, [catchUpSignals, groupApi, reconcilePeers, status, stream, userId]);

  // ---------- «я ещё здесь» ----------

  useEffect(() => {
    if (state.phase !== 'active' || !state.call) return;
    const callId = state.call.id;
    const timer = setInterval(() => {
      void groupApi
        .heartbeat(callId)
        .then((fresh) => {
          heartbeatFailures.current = 0;
          dispatch({ type: 'stream', event: { type: 'group-call.updated', call: fresh }, selfId: userId });
          reconcilePeers(fresh);
          resyncScreenFlag(fresh);
        })
        .catch(() => {
          heartbeatFailures.current += 1;
          // Подтверждения не доходят дольше, чем сервер готов ждать: нас
          // там уже нет, и показывать «разговор» с бегущим таймером —
          // врать. Одна-две осечки сюда не попадают, их сервер переживает.
          if (!heartbeatLost(heartbeatFailures.current)) return;
          teardown();
          dispatch({ type: 'failed', error: HEARTBEAT_LOST_MESSAGE });
        });
    }, GROUP_CALL_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [groupApi, reconcilePeers, resyncScreenFlag, state.call, state.phase, teardown, userId]);

  // ---------- кто говорит ----------

  useEffect(() => {
    if (state.phase !== 'active') return;
    const timer = setInterval(() => {
      void (async () => {
        const levels: Record<string, number> = {};
        const entries = [...links.current.entries()];
        for (const [peerId, link] of entries) levels[peerId] = await link.audioLevel();
        if (entries.length > 0) levels[userId] = await entries[0][1].ownAudioLevel();
        const muted = new Set<string>();
        if (stateRef.current.muted) muted.add(userId);
        for (const participant of stateRef.current.call?.participants ?? [])
          if (participant.muted) muted.add(participant.user.id);
        speaking.current = nextSpeakingState(
          speaking.current,
          levels,
          Date.now(),
          muted,
        );
        dispatch({ type: 'speaking', userIds: speakingIds(speaking.current) });
      })();
    }, SPEAKING_POLL_MS);
    return () => clearInterval(timer);
  }, [state.phase, userId]);

  // ---------- восстановление и выход из приложения ----------

  useEffect(() => {
    if (status !== 'signed') return;
    // Приложение перезапустили во время звонка — комната всё ещё живёт на
    // сервере, но медиа поднимать заново: соединения умерли вместе с
    // процессом.
    void groupApi
      .active()
      .then(({ call }) => {
        if (!call) return;
        dispatch({ type: 'restore', call, at: Date.now() });
        void enterRoom(call).catch(() => dispatch({ type: 'reset' }));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при входе в сессию
  }, [status]);

  useEffect(() => {
    if (status === 'signed') return;
    teardown();
    dispatch({ type: 'reset' });
  }, [status, teardown]);

  // Приложение убито/свёрнуто надолго — heartbeat остановится сам, и
  // сервер уберёт нас как мёртвого. Специально ничего не делаем при уходе
  // в фон: групповой звонок продолжает идти, как и обычный.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      // Состояние приложения нужно не только для дочитывания сигналов: по
      // нему гаснет камера (`group-video-state.ts`). Звук при этом
      // продолжает идти — групповой звонок в фоне живёт, как и обычный.
      setAppStateValue(next);
      if (next !== 'active') return;
      const call = stateRef.current.call;
      if (call && stateRef.current.phase === 'active') void catchUpSignals();
    });
    return () => subscription.remove();
  }, [catchUpSignals]);

  const callInConversation = useCallback(
    (conversationId: string) => roomsByConversation[conversationId] ?? null,
    [roomsByConversation],
  );

  const watchConversation = useCallback(
    (conversationId: string) => {
      if (status !== 'signed') return;
      void groupApi
        .active(conversationId)
        .then(({ call }) =>
          setRoomsByConversation((rooms) => {
            const next = { ...rooms };
            if (call && call.status === 'live') next[conversationId] = call;
            else delete next[conversationId];
            return next;
          }),
        )
        .catch(() => undefined);
    },
    [groupApi, status],
  );

  const clearActionError = useCallback(
    () => dispatch({ type: 'clear-action-error' }),
    [],
  );

  /**
   * Скрытая сводка видео по парам (`formatVideoDiagnostics`) — снять с
   * релизной сборки, которая молчит в logcat, при следующей чёрной плитке.
   */
  const videoDiagnostics = useCallback(async () => {
    const peers = await Promise.all(
      [...links.current.values()].map((link) => link.videoDiagnostics()),
    );
    const own = screenTrack.current
      ? 'Свой экран: показываем'
      : cameraTrack.current
        ? `Своя камера: снимает (${sendingVideoRef.current ? 'отдаём' : 'не отдаём'})`
        : 'Своя камера: выключена';
    return `${own}\n\n${formatVideoDiagnostics(peers)}`;
  }, []);

  const value = useMemo<GroupCallsApi>(
    () => ({
      state,
      selfId: userId,
      callInConversation,
      watchConversation,
      startOrJoin,
      join,
      leave,
      toggleMute,
      cameraOn,
      sendingVideo,
      localVideoStream,
      toggleCamera,
      switchCamera,
      screenSupported,
      screenOn,
      toggleScreenShare,
      localScreenStream,
      remoteStreams,
      remoteVideoOff,
      pipActive,
      clearActionError,
      reportScreenMounted: setScreenVisible,
      dismiss,
      videoDiagnostics,
    }),
    [
      videoDiagnostics,
      callInConversation,
      cameraOn,
      clearActionError,
      dismiss,
      join,
      leave,
      localScreenStream,
      localVideoStream,
      pipActive,
      remoteStreams,
      remoteVideoOff,
      screenOn,
      screenSupported,
      sendingVideo,
      startOrJoin,
      state,
      switchCamera,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
      userId,
      watchConversation,
    ],
  );

  return (
    <GroupCallsContext.Provider value={value}>
      {children}
      <GroupCallBanner visible={!screenVisible} />
    </GroupCallsContext.Provider>
  );
}

/**
 * Отпустить захват экрана нативно: `stop()` в react-native-webrtc лишь
 * выключает дорожку, а захват, `MediaProjection` и служба показа с её
 * уведомлением освобождаются только `release()`. В веб-сборке приложения
 * показа нет вовсе, и `release` там не объявлен — отсюда `?.`.
 */
function releaseScreen(media: MediaStream | null): void {
  if (!media) return;
  for (const track of media.getTracks()) track.stop();
  (media as MediaStream & { release?: () => void }).release?.();
}

/**
 * `AppStateStatus` знает ещё `'unknown'` и `'extension'`. Неизвестное
 * состояние считаем фоном: ошибиться в сторону погашенной камеры дешевле,
 * чем греть телефон в состоянии, о котором мы ничего не знаем.
 */
function normalizeAppState(
  value: AppStateStatus,
): 'active' | 'background' | 'inactive' {
  if (value === 'active' || value === 'inactive') return value;
  return 'background';
}

function isGroupCallEvent(
  event: ChatStreamEvent,
): event is Extract<ChatStreamEvent, { type: `group-call.${string}` }> {
  return typeof event.type === 'string' && event.type.startsWith('group-call.');
}

/** Состав комнаты глазами экрана — вынесено, чтобы не считать в JSX. */
export function visibleParticipants(state: GroupCallState) {
  return state.call?.participants ?? [];
}
