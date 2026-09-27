"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  ChatCallSignal,
  ChatGroupCallDto,
  ChatGroupCallStreamEvent,
  ChatIceServerDto,
  ChatStreamEvent,
} from "@vedamatch/shared";
import { API_URL } from "@/lib/http-client";
import { getChatIceServers } from "@/lib/chat-calls-client";
import {
  getActiveGroupCall,
  getGroupCallSignals,
  heartbeatGroupCall,
  joinGroupCall,
  leaveGroupCall,
  sendGroupCallSignal,
  setGroupCallMuted,
  setGroupCallScreen,
  setGroupCallVideo,
  startGroupCall,
} from "@/lib/chat-group-calls-client";
import { ApiError } from "@/lib/http-client";
import { subscribeToChat, subscribeToChatReconnect } from "@/lib/chat-stream";
import {
  admitCallSignal,
  INITIAL_SIGNAL_SEQ_STATE,
  type SignalSeqState,
} from "../call-signal-catchup";
import { sendWithRetry } from "../call-signal-retry";
import { SignalSendQueue } from "../call-signal-send-queue";
import { GroupCallsContext, type GroupCallsApi } from "./group-call-context";
import { describeGroupCallError } from "./group-call-error";
import {
  GROUP_CALL_HEARTBEAT_MS,
  HEARTBEAT_LOST_MESSAGE,
  heartbeatLost,
} from "./group-call-heartbeat";
import { planPeers } from "./group-call-peers";
import {
  buildMediaSignal,
  readMediaSignal,
  shouldAnnounceMedia,
} from "./media-state-signal";
import {
  degradationFor,
  encodingChanged,
  groupScreenEncoding,
  groupVideoEncoding,
  type DegradationPreference,
  type VideoEncoding,
} from "./group-video-quality";
import { outgoingVideo } from "./group-video-state";
import {
  cameraToggleNeedsServer,
  canShareScreen,
  describeScreenShareError,
  screenButtonState,
  screenFlagStale,
  screenStopPatch,
} from "./screen-share";
import {
  IDLE_GROUP_CALL_STATE,
  reduceGroupCall,
} from "./group-call-state";
import { GroupPeerLink } from "./group-peer-link";
import {
  EMPTY_SPEAKING_STATE,
  nextSpeakingState,
  speakingIds,
  type SpeakingState,
} from "./speaking-state";
import { GroupCallBanner } from "./group-call-banner";
import { GroupCallOverlay } from "./group-call-overlay";
import { GroupCallAudio } from "./group-call-audio";

/**
 * Провайдер групповых звонков на сайте (VED-293, этап 2 — веб).
 *
 * Устроен как расширение звонка один на один, а не как второй механизм:
 * тот же поток событий `chat-stream.ts`, те же TURN-учётки
 * (`getChatIceServers`), та же очередь и дедупликация сигналов
 * (`call-signal-*.ts`), тот же `webrtc-signal-guard`. Разница ровно в
 * трёх местах, и все три — следствие mesh'а:
 *
 * 1. Соединение не одно, а по одному на каждого собеседника
 *    (`Map<userId, GroupPeerLink>`). План — `group-call-peers.ts`: позже
 *    вошедший шлёт offer всем, кто уже был.
 * 2. Микрофон захватывается ОДИН раз на всю комнату и раздаётся во все
 *    соединения. Выход одного собеседника закрывает его соединение, но не
 *    трогает поток — иначе микрофон замолчал бы для остальных.
 * 3. Звук чужих голосов играет `GroupCallAudio` — по `<audio>` на каждого,
 *    и живёт он в провайдере, а не в панели: свернуть комнату и оглохнуть
 *    было бы странно. Свой поток не воспроизводится никогда — это и есть
 *    то самое эхо.
 *
 * Отдельный провайдер, а не ветка внутри `call-provider.tsx`: смешивать
 * состояние «один звонок, две роли» и «комната, до шести соединений» в
 * одном редьюсере — верный способ сломать работающий звонок один на один.
 *
 * Чистая часть — `group-call-state.ts` (что показывать),
 * `group-call-peers.ts` (кто с кем соединяется), `speaking-state.ts` (кто
 * говорит), `group-call-error.ts` (почему не пустили),
 * `group-call-heartbeat.ts` (когда считать себя выпавшим); всё со своими
 * спеками. Сам провайдер — склейка вокруг браузерного WebRTC и потому не
 * тестируется, по тому же правилу, что и `call-provider.tsx`.
 */

/** Как часто опрашиваем уровни звука для подписи «говорит». */
const SPEAKING_POLL_MS = 400;

export function GroupCallProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    reduceGroupCall,
    IDLE_GROUP_CALL_STATE,
  );
  const stateRef = useRef(state);
  // Обработчики читают свежее состояние через ref: обновляем его после
  // отрисовки, а не во время неё.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /** Комнаты, идущие в беседах, — для плашки «идёт звонок». */
  const [roomsByConversation, setRoomsByConversation] = useState<
    Record<string, ChatGroupCallDto>
  >({});
  const [expanded, setExpanded] = useState(false);
  /** Голоса собеседников: userId → поток, который играет `<audio>`. */
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  /**
   * Камера (VED-293, этап 4). Отдельно от `localStream`: микрофон
   * захватывается один раз на весь звонок, а камера включается и гаснет по
   * ходу — по кнопке и когда вкладку увели. Держать её внутри общего потока
   * значило бы либо не гасить её вовсе, либо каждый раз пересобирать
   * микрофон.
   */
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(
    null,
  );
  /** Человек хочет камеру включённой. Что реально уходит — `outgoingVideo`. */
  const [cameraOn, setCameraOn] = useState(false);
  /**
   * Показ экрана (VED-360): экран подменяет камеру в том же отправителе.
   * `cameraOn` при этом не трогается — это то, вернётся ли камера, когда
   * показ кончится.
   */
  const [screenOn, setScreenOn] = useState(false);
  /** Свой экран — для своей плитки. `null`, пока не показываем. */
  const [localScreenStream, setLocalScreenStream] =
    useState<MediaStream | null>(null);
  /**
   * Умеет ли браузер показ. На сервере — «нет»: там нет ни `navigator`, ни
   * экрана, а кнопка, мигнувшая при гидратации, хуже появившейся следом.
   */
  const screenSupported = useSyncExternalStore(
    subscribeNever,
    readScreenSupport,
    () => false,
  );
  /** Кто сообщил `{kind:"media"}`, что сейчас не снимает. */
  const [remoteVideoOff, setRemoteVideoOff] = useState<
    Record<string, boolean>
  >({});
  const [tabHidden, setTabHidden] = useState(false);

  const links = useRef(new Map<string, GroupPeerLink>());
  const localStream = useRef<MediaStream | null>(null);
  const iceServers = useRef<ChatIceServerDto[]>([]);
  const sendQueue = useRef(new SignalSendQueue());
  const seqState = useRef<SignalSeqState>(INITIAL_SIGNAL_SEQ_STATE);
  const speaking = useRef<SpeakingState>(EMPTY_SPEAKING_STATE);
  const heartbeatFailures = useRef(0);
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  /** Идёт запрос начала показа — `screenFlagStale` в это окно не чинит. */
  const screenPending = useRef(false);
  /** Последнее применённое качество — чтобы не звать `setParameters` впустую. */
  const appliedEncoding = useRef<VideoEncoding | null>(null);
  const appliedDegradation = useRef<DegradationPreference | null>(null);
  /** Сколько людей в комнате — потолок качества пересчитывается и по нему. */
  const participantCount = useRef(0);
  /** Что мы в последний раз сообщили о своей камере каждому собеседнику. */
  const announcedMedia = useRef(new Map<string, boolean>());

  /**
   * Что уходит в видео-отправитель — экран, камера или ничего — решает
   * чистый `outgoingVideo` (`group-video-state.ts`), а не разбросанные по
   * провайдеру условия. `ref` рядом нужен обработчикам вне рендера
   * (соединение, поднятое из пришедшего offer).
   */
  const outgoing = outgoingVideo({
    phase: state.phase,
    cameraOn,
    screenOn,
    hidden: tabHidden,
  });
  const sendingVideo = outgoing !== null;
  const outgoingRef = useRef(outgoing);
  const sendingVideoRef = useRef(sendingVideo);
  const cameraOnRef = useRef(cameraOn);
  const screenOnRef = useRef(screenOn);
  // Через эффект, а не прямо в теле: запись в `ref` во время отрисовки —
  // та же ошибка, из-за которой рядом так же синхронизируется `stateRef`.
  // Читают эти `ref` только обработчики вне отрисовки (соединение,
  // поднятое из пришедшего offer), и они срабатывают уже после эффекта.
  useEffect(() => {
    outgoingRef.current = outgoing;
    sendingVideoRef.current = sendingVideo;
    cameraOnRef.current = cameraOn;
    screenOnRef.current = screenOn;
  }, [cameraOn, outgoing, screenOn, sendingVideo]);

  /** Дорожка, которая сейчас должна стоять в отправителях. */
  const currentVideoTrack = useCallback(
    (): MediaStreamTrack | null =>
      outgoingRef.current === "screen"
        ? screenTrack.current
        : outgoingRef.current === "camera"
          ? cameraTrack.current
          : null,
    [],
  );

  // ---------- сигналинг ----------

  const sendSignal = useCallback(
    (callId: string, toUserId: string, signal: ChatCallSignal) => {
      // Один ключ на сигнал, не на попытку (VED-261): повтор после
      // «сервер сохранил, ответ потерялся» — идемпотентный no-op, а не
      // второй offer с новым seq.
      const clientSignalId = crypto.randomUUID();
      void sendQueue.current.enqueue(() =>
        sendWithRetry(() =>
          sendGroupCallSignal(callId, toUserId, signal, clientSignalId),
        ),
      );
    },
    [],
  );

  /**
   * Потолок качества по составу комнаты (`group-video-quality.ts`).
   * Пересчитывается и на вход, и на выход: втроём браузер кодирует кадр
   * дважды, а разошлись — картинка обязана вернуться, а не доживать
   * разговор на 360p.
   */
  const applyVideoQuality = useCallback((count: number) => {
    participantCount.current = count;
    // Экрану — свой потолок: кадр не уменьшается, падает частота
    // (`groupScreenEncoding`). Пересчёт идёт и на смену источника.
    const source = outgoingRef.current === "screen" ? "screen" : "camera";
    const target =
      source === "screen"
        ? groupScreenEncoding(count)
        : groupVideoEncoding(count);
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

  const linkFor = useCallback(
    (
      callId: string,
      peerId: string,
      initiator: boolean,
    ): GroupPeerLink | null => {
      const existing = links.current.get(peerId);
      if (existing) return existing;
      const stream = localStream.current;
      if (!stream) return null;
      const link = new GroupPeerLink(
        peerId,
        iceServers.current,
        initiator,
        stream,
        {
          onSignal: (signal) => sendSignal(callId, peerId, signal),
          onRemoteStream: (remote) =>
            setRemoteStreams((current) =>
              current[peerId] === remote
                ? current
                : { ...current, [peerId]: remote },
            ),
          onStateChange: (peerState) => {
            dispatch({ type: "peer-state", userId: peerId, state: peerState });
            // Связь встала (в том числе заново после перезапуска ICE) —
            // состояние камеры сообщаем ещё раз: прошлый сигнал мог не
            // дойти, а молчание собеседник считает за «камера снимает».
            if (peerState === "connected") announcedMedia.current.delete(peerId);
          },
        },
      );
      links.current.set(peerId, link);
      // Новому соединению сразу отдаём и картинку (камеру или экран), и
      // потолок качества: без этого вошедший четвёртым видел бы пустые
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

  const closeLink = useCallback((peerId: string) => {
    links.current.get(peerId)?.close();
    links.current.delete(peerId);
    announcedMedia.current.delete(peerId);
    setRemoteStreams((current) => {
      if (!(peerId in current)) return current;
      const next = { ...current };
      delete next[peerId];
      return next;
    });
    // «Его камера выключена» уходит вместе с соединением: иначе плитка
    // вернувшегося осталась бы заглушкой навсегда.
    setRemoteVideoOff((current) => {
      if (!(peerId in current)) return current;
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const closeAllLinks = useCallback(() => {
    for (const link of links.current.values()) link.close();
    links.current.clear();
    announcedMedia.current.clear();
    setRemoteStreams({});
    setRemoteVideoOff({});
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
    async (
      fromUserId: string,
      seq: number | undefined,
      signal: ChatCallSignal,
    ) => {
      const admission = admitCallSignal(seqState.current, seq);
      seqState.current = admission.next;
      if (!admission.admit) return;
      const call = stateRef.current.call;
      if (!call) return;
      // «Моя камера сейчас не снимает» — не для WebRTC, а для плитки
      // собеседника (`media-state-signal.ts`). В соединение не несём:
      // `handleSignal` про такой вид ничего не знает.
      const media = readMediaSignal(signal);
      if (media) {
        setRemoteVideoOff((current) =>
          current[fromUserId] === !media.video
            ? current
            : { ...current, [fromUserId]: !media.video },
        );
        return;
      }
      // Соединения с этим человеком ещё нет — значит offer пришёл раньше,
      // чем до нас доехал новый состав комнаты. Поднимаем отвечающую
      // сторону сразу: ждать события `group-call.updated` значит терять
      // offer, ровно как это было в VED-261 у звонка один на один.
      const link = linkFor(call.id, fromUserId, false);
      await link?.handleSignal(signal).catch(logSignalError);
    },
    [linkFor],
  );

  /** Дочитать пропущенное, пока поток был закрыт (обрыв, сон вкладки). */
  const catchUpSignals = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== "active") return;
    try {
      const { signals } = await getGroupCallSignals(
        call.id,
        seqState.current.lastSeq,
      );
      for (const envelope of signals)
        await applySignal(envelope.fromUserId, envelope.seq, envelope.signal);
    } catch {
      // Следующая пересинхронизация потока попробует снова.
    }
  }, [applySignal]);

  // ---------- вход и выход ----------

  const teardown = useCallback(() => {
    closeAllLinks();
    for (const track of localStream.current?.getTracks() ?? []) track.stop();
    localStream.current = null;
    // Камера отпускает железо вместе с концом звонка — иначе индикатор
    // камеры во вкладке продолжает гореть после выхода.
    cameraTrack.current?.stop();
    cameraTrack.current = null;
    setLocalVideoStream(null);
    setCameraOn(false);
    // Показ экрана кончается вместе со звонком: иначе браузер продолжал бы
    // показывать полоску «идёт запись экрана» после выхода.
    screenTrack.current?.stop();
    screenTrack.current = null;
    screenOnRef.current = false;
    screenPending.current = false;
    setLocalScreenStream(null);
    setScreenOn(false);
    announcedMedia.current.clear();
    appliedEncoding.current = null;
    appliedDegradation.current = null;
    speaking.current = EMPTY_SPEAKING_STATE;
    seqState.current = INITIAL_SIGNAL_SEQ_STATE;
    sendQueue.current = new SignalSendQueue();
    heartbeatFailures.current = 0;
  }, [closeAllLinks]);

  const enterRoom = useCallback(
    async (call: ChatGroupCallDto) => {
      const { iceServers: servers } = await getChatIceServers();
      iceServers.current = servers;
      if (!localStream.current)
        // Эхоподавление и шумодав — на захвате: в mesh'е свой голос
        // приходит обратно в четырёх копиях, и без них комната воет.
        localStream.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      heartbeatFailures.current = 0;
      dispatch({ type: "joined", call, at: Date.now() });
      setExpanded(true);
      reconcilePeers(call);
    },
    [reconcilePeers],
  );

  /**
   * Вход не удался. Если комната нас уже приняла (микрофон не дали уже
   * ПОСЛЕ ответа сервера), надо выйти явно: иначе мы висим в составе у
   * остальных до истечения TTL, беззвучный и бесполезный.
   */
  const failEntry = useCallback(
    (error: unknown, call: ChatGroupCallDto | null) => {
      teardown();
      dispatch({ type: "failed", error: describeGroupCallError(error).message });
      if (call) void leaveGroupCall(call.id).catch(() => undefined);
    },
    [teardown],
  );

  const startOrJoin = useCallback(
    async (conversationId: string) => {
      const phase = stateRef.current.phase;
      if (phase === "active" || phase === "joining") return;
      dispatch({ type: "joining" });
      let call: ChatGroupCallDto | null = null;
      try {
        // Потолок держит сервер: кнопка гаснет по известному ей составу,
        // но между «нажал» и «дошло» место мог занять кто-то ещё — и
        // тогда сюда приходит 409 с готовой формулировкой.
        call = await startGroupCall(conversationId);
        await enterRoom(call);
      } catch (error) {
        failEntry(error, call);
      }
    },
    [enterRoom, failEntry],
  );

  const join = useCallback(
    async (callId: string) => {
      const phase = stateRef.current.phase;
      if (phase === "active" || phase === "joining") return;
      dispatch({ type: "joining" });
      let call: ChatGroupCallDto | null = null;
      try {
        call = await joinGroupCall(callId);
        await enterRoom(call);
      } catch (error) {
        failEntry(error, call);
      }
    },
    [enterRoom, failEntry],
  );

  const leave = useCallback(async () => {
    const call = stateRef.current.call;
    teardown();
    dispatch({ type: "left" });
    if (!call) return;
    // Выход сообщаем серверу, но панель не ждёт ответа: если сеть уже
    // пропала, человека уберёт уборщик мёртвых участников.
    try {
      await leaveGroupCall(call.id);
    } catch {
      // Молча: состав всё равно пересчитает сервер.
    }
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const next = !stateRef.current.muted;
    dispatch({ type: "toggle-mute" });
    for (const track of localStream.current?.getAudioTracks() ?? [])
      track.enabled = !next;
    const call = stateRef.current.call;
    if (call)
      void setGroupCallMuted(call.id, next).catch(() => {
        // Сервер не узнал — у остальных значок микрофона отстанет до
        // следующего подтверждения, звук при этом уже выключен.
      });
  }, []);

  // ---------- камера ----------

  /**
   * Сообщить собеседникам, снимаем ли мы сейчас (`media-state-signal.ts`).
   *
   * Без этого скрытая вкладка показывала бы остальным замёрзший кадр:
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
   * Включить или выключить камеру. Решение принимает СЕРВЕР: мест под видео
   * в комнате три, а участников четыре, и между «нажал» и «дошло» место мог
   * занять сосед. Поэтому порядок такой — сперва спрашиваем разрешение
   * (`POST /state`), и только получив его, трогаем камеру.
   *
   * Обратный порядок («включим, а сервер потом подтвердит») выглядел бы
   * отзывчивее и был бы неверен: четвёртый успел бы увидеть свою картинку,
   * прежде чем она погаснет, — а остальным его кадры при этом не пошли бы
   * вовсе. Честный отказ лучше мигнувшей картинки.
   *
   * Выключение сервера не спрашивает: гасим сразу, сообщаем следом.
   * Отказать в выключении своей камеры невозможно по смыслу, а ждать сети,
   * чтобы перестать снимать, — лишние секунды работы кодера.
   */
  const toggleCamera = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== "active") return;
    const next = !cameraOn;

    // Во время показа экрана место под видео держит экран, а камера в
    // отправитель не попадёт до конца показа. Нажатие решает только,
    // вернётся ли она потом, — сервер узнает об этом вместе с концом
    // показа (`screenStopPatch`). `{video:false}` сейчас погасил бы показ.
    if (!cameraToggleNeedsServer(screenOnRef.current)) {
      setCameraOn(next);
      return;
    }

    if (!next) {
      setCameraOn(false);
      void setGroupCallVideo(call.id, false).catch(() => {
        // Сервер не узнал — место освободится вместе с подтверждением
        // присутствия или выходом. Картинка у остальных уже погасла.
      });
      return;
    }

    try {
      await setGroupCallVideo(call.id, true);
    } catch (error) {
      // Текст отказа пришёл с сервера — показываем его, а не свой пересказ
      // правила, которое сервер вправе поменять без нас.
      dispatch({
        type: "failed-action",
        error: describeGroupCallError(error).message,
      });
      return;
    }
    setCameraOn(true);
  }, [cameraOn]);

  /**
   * Привести отправитель в соответствие решению `outgoingVideo`: захватить
   * камеру и раздать её во все соединения, либо раздать экран, либо
   * ничего, — и сообщить собеседникам, идёт ли картинка.
   *
   * Камера именно ОСТАНАВЛИВАЕТСЯ, а не глушится `enabled = false`, в том
   * числе на время показа экрана: выключенная камера обязана отпустить
   * железо (во вкладке гаснет индикатор), иначе экономии, ради которой всё
   * затевалось, не будет. После показа она захватывается заново.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (outgoing === "camera") {
        if (!cameraTrack.current) {
          // Пока камера захватывается, в отправителе не должно остаться
          // остановленного экрана — у собеседников замёрз бы его кадр.
          for (const link of links.current.values())
            void link.setVideoTrack(null);
          try {
            const media = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { facingMode: "user" },
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
            // Камеру не дали — место под видео сервер держать не должен.
            if (cancelled) return;
            setCameraOn(false);
            const call = stateRef.current.call;
            if (call)
              void setGroupCallVideo(call.id, false).catch(() => undefined);
            dispatch({
              type: "failed-action",
              error: describeGroupCallError(error).message,
            });
            return;
          }
        }
        for (const link of links.current.values())
          void link.setVideoTrack(cameraTrack.current);
      } else {
        cameraTrack.current?.stop();
        cameraTrack.current = null;
        setLocalVideoStream(null);
        const track = outgoing === "screen" ? screenTrack.current : null;
        for (const link of links.current.values())
          void link.setVideoTrack(track);
      }
      // Источник сменился — потолок качества тоже: экрану нужен полный
      // кадр, камере — лестница по составу.
      applyVideoQuality(participantCount.current);
      announceMedia();
    })();
    return () => {
      cancelled = true;
    };
  }, [announceMedia, applyVideoQuality, outgoing]);

  // ---------- показ экрана ----------

  /**
   * Закончить показ — кнопкой, системной «Прекратить доступ» браузера или
   * выходом. Камера возвращается, если была включена, иначе видео гаснет и
   * место под него отдаётся: серверу — одним запросом (`screenStopPatch`).
   *
   * Запрос повторяется при сбое: потерянный конец показа держал бы у всех
   * крупную плитку и не давал показать никому другому. Если и повторы не
   * дошли, чинит подтверждение присутствия (`screenFlagStale`).
   */
  const stopScreenShare = useCallback(() => {
    const track = screenTrack.current;
    if (!track && !screenOnRef.current) return;
    screenTrack.current = null;
    track?.stop();
    setLocalScreenStream(null);
    setScreenOn(false);
    // Отправитель переключит эффект выше, как только `outgoing` сменится;
    // `ref` правим сразу, чтобы соединение, поднятое в этот промежуток, не
    // получило остановленный экран.
    screenOnRef.current = false;
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== "active") return;
    const patch = screenStopPatch(cameraOnRef.current);
    void sendWithRetry(() =>
      setGroupCallScreen(call.id, patch).then(() => undefined),
    );
  }, []);

  /**
   * Начать показ. Порядок обратный камере — сперва системное окно выбора,
   * потом разрешение сервера, — и это не прихоть: `getDisplayMedia`
   * браузер открывает только в ответ на нажатие, а ожидание сети это
   * право съедает (Safari — сразу, Chrome — через несколько секунд).
   * Остальные при этом ничего лишнего не видят: в отправитель экран
   * попадает только после ответа сервера, а при отказе захват сразу
   * останавливается.
   */
  const toggleScreenShare = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== "active") return;
    if (screenOnRef.current) {
      stopScreenShare();
      return;
    }
    if (screenPending.current) return;
    // Заведомый отказ (показывает другой, мест нет) объясняем сразу, не
    // открывая окно выбора: выбрать окно и только потом услышать «нельзя»
    // обиднее. Решает всё равно сервер — это только подсказка.
    const hint = screenButtonState(call, userId, {
      sharing: false,
      supported: true,
    });
    if (hint.blocked) {
      if (hint.blockedReason)
        dispatch({ type: "failed-action", error: hint.blockedReason });
      return;
    }
    screenPending.current = true;
    let media: MediaStream | null = null;
    try {
      media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const [track] = media.getVideoTracks();
      if (!track) throw new Error("Не удалось показать экран");
      await setGroupCallScreen(call.id, { screen: true });
      if (
        stateRef.current.phase !== "active" ||
        stateRef.current.call?.id !== call.id
      ) {
        // Пока ждали ответа, звонок кончился — показ отпускаем.
        for (const t of media.getTracks()) t.stop();
        return;
      }
      // Подсказка кодеру: это текст и линии, а не лицо — держать резкость.
      track.contentHint = "detail";
      // Системная «Прекратить доступ» браузера и закрытие показываемого
      // окна заканчивают показ так же, как наша кнопка.
      track.addEventListener("ended", stopScreenShare, { once: true });
      screenTrack.current = track;
      screenOnRef.current = true;
      setLocalScreenStream(media);
      setScreenOn(true);
    } catch (error) {
      for (const t of media?.getTracks() ?? []) t.stop();
      const message = describeScreenShareError(
        error,
        (e): e is Error => e instanceof ApiError,
      );
      if (message) dispatch({ type: "failed-action", error: message });
    } finally {
      screenPending.current = false;
    }
  }, [stopScreenShare, userId]);

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
      void setGroupCallScreen(
        call.id,
        screenStopPatch(cameraOnRef.current),
      ).catch(() => undefined);
    },
    [userId],
  );

  /**
   * Вкладку увели — камеру гасим (`group-video-state.ts`). Звук при этом
   * идёт дальше: разговор в свёрнутой вкладке — нормальный сценарий, а вот
   * кодировать картинку, которую никто не смотрит, незачем.
   */
  useEffect(() => {
    const read = () => setTabHidden(document.visibilityState === "hidden");
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);

  const clearActionError = useCallback(
    () => dispatch({ type: "clear-action-error" }),
    [],
  );

  const dismiss = useCallback(() => {
    teardown();
    dispatch({ type: "reset" });
  }, [teardown]);

  // ---------- общий поток событий ----------

  useEffect(() => {
    return subscribeToChat((event: ChatStreamEvent) => {
      if (!isGroupCallEvent(event)) return;
      if (event.type === "group-call.signal") {
        if (event.callId !== stateRef.current.call?.id) return;
        void applySignal(event.fromUserId, event.seq, event.signal);
        return;
      }

      // Плашка «идёт звонок» в беседе — это и есть «входящий групповой»:
      // вкладка не звонит, в переписке появляется строка с кнопкой войти.
      setRoomsByConversation((rooms) => {
        const next = { ...rooms };
        if (event.call.status === "live")
          next[event.call.conversationId] = event.call;
        else delete next[event.call.conversationId];
        return next;
      });

      dispatch({ type: "stream", event, selfId: userId });
      if (
        stateRef.current.phase === "active" &&
        event.call.id === stateRef.current.call?.id &&
        event.type !== "group-call.ended"
      )
        reconcilePeers(event.call);
    });
  }, [applySignal, reconcilePeers, userId]);

  // Поток переподключился — состав и пропущенные сигналы перечитываем.
  useEffect(() => {
    return subscribeToChatReconnect(() => {
      const call = stateRef.current.call;
      if (!call || stateRef.current.phase !== "active") return;
      void heartbeatGroupCall(call.id)
        .then((fresh) => {
          heartbeatFailures.current = 0;
          dispatch({
            type: "stream",
            event: { type: "group-call.updated", call: fresh },
            selfId: userId,
          });
          reconcilePeers(fresh);
        })
        .catch(() => undefined);
      void catchUpSignals();
    });
  }, [catchUpSignals, reconcilePeers, userId]);

  // ---------- «я ещё здесь» ----------

  useEffect(() => {
    if (state.phase !== "active" || !state.call) return;
    const callId = state.call.id;
    const timer = setInterval(() => {
      void heartbeatGroupCall(callId)
        .then((fresh) => {
          heartbeatFailures.current = 0;
          dispatch({
            type: "stream",
            event: { type: "group-call.updated", call: fresh },
            selfId: userId,
          });
          reconcilePeers(fresh);
          resyncScreenFlag(fresh);
        })
        .catch(() => {
          heartbeatFailures.current += 1;
          // Подтверждения не доходят дольше, чем сервер готов ждать: нас
          // там уже нет, и показывать «разговор» больше нельзя.
          if (!heartbeatLost(heartbeatFailures.current)) return;
          teardown();
          dispatch({ type: "failed", error: HEARTBEAT_LOST_MESSAGE });
        });
    }, GROUP_CALL_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [
    reconcilePeers,
    resyncScreenFlag,
    state.call,
    state.phase,
    teardown,
    userId,
  ]);

  // ---------- кто говорит ----------

  useEffect(() => {
    if (state.phase !== "active") return;
    const timer = setInterval(() => {
      void (async () => {
        const levels: Record<string, number> = {};
        const entries = [...links.current.entries()];
        for (const [peerId, link] of entries)
          levels[peerId] = await link.audioLevel();
        // Свой микрофон виден в отчёте любого соединения — берём первый.
        if (entries.length > 0)
          levels[userId] = await entries[0][1].ownAudioLevel();
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
        dispatch({ type: "speaking", userIds: speakingIds(speaking.current) });
      })();
    }, SPEAKING_POLL_MS);
    return () => clearInterval(timer);
  }, [state.phase, userId]);

  // ---------- восстановление и закрытие вкладки ----------

  // Вкладку перезагрузили во время звонка: комната всё ещё живёт на
  // сервере, но медиа поднимать заново — соединения умерли вместе со
  // страницей.
  useEffect(() => {
    let cancelled = false;
    void getActiveGroupCall()
      .then(({ call }) => {
        if (cancelled || !call) return;
        dispatch({ type: "restore", call, at: Date.now() });
        void enterRoom(call).catch((error) => failEntry(error, call));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Только при монтировании провайдера: повторное восстановление посреди
    // звонка подняло бы вторую копию медиа.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Закрыли вкладку посреди звонка. Подтверждения присутствия перестанут
   * уходить, и через TTL сервер уберёт нас сам, — но сорок пять секунд
   * молчащего человека в списке остальные видеть не должны, поэтому
   * говорим о выходе сразу. `keepalive` — единственный способ дать запросу
   * пережить закрытие страницы.
   */
  useEffect(() => {
    const onUnload = () => {
      const current = stateRef.current;
      if (!current.call || current.phase !== "active") return;
      void fetch(`${API_URL}/chat/group-calls/${current.call.id}/leave`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => undefined);
      for (const link of links.current.values()) link.close();
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  // ---------- плашка в беседе ----------

  const callInConversation = useCallback(
    (conversationId: string) => roomsByConversation[conversationId] ?? null,
    [roomsByConversation],
  );

  const watchConversation = useCallback((conversationId: string) => {
    void getActiveGroupCall(conversationId)
      .then(({ call }) =>
        setRoomsByConversation((rooms) => {
          const next = { ...rooms };
          if (call && call.status === "live") next[conversationId] = call;
          else delete next[conversationId];
          return next;
        }),
      )
      .catch(() => undefined);
  }, []);

  const value = useMemo<GroupCallsApi>(
    () => ({
      state,
      selfId: userId,
      expanded,
      callInConversation,
      watchConversation,
      startOrJoin,
      join,
      leave,
      toggleMute,
      cameraOn,
      sendingVideo,
      toggleCamera,
      localVideoStream,
      screenSupported,
      screenOn,
      toggleScreenShare,
      localScreenStream,
      remoteStreams,
      remoteVideoOff,
      clearActionError,
      setExpanded,
      dismiss,
    }),
    [
      callInConversation,
      cameraOn,
      clearActionError,
      dismiss,
      expanded,
      join,
      leave,
      localScreenStream,
      localVideoStream,
      remoteStreams,
      remoteVideoOff,
      screenOn,
      screenSupported,
      sendingVideo,
      startOrJoin,
      state,
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
      <GroupCallAudio streams={remoteStreams} />
      <GroupCallBanner />
      <GroupCallOverlay />
    </GroupCallsContext.Provider>
  );
}

/** Умение браузера не меняется за жизнь вкладки — подписываться не на что. */
function subscribeNever(): () => void {
  return () => undefined;
}

function readScreenSupport(): boolean {
  return canShareScreen({
    hasGetDisplayMedia:
      typeof navigator.mediaDevices?.getDisplayMedia === "function",
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

function isGroupCallEvent(
  event: ChatStreamEvent,
): event is ChatGroupCallStreamEvent {
  return typeof event.type === "string" && event.type.startsWith("group-call.");
}

/**
 * Молчать здесь нельзя по той же причине, что и у звонка один на один:
 * отклонённый `handleSignal` — это либо сетевая ошибка, либо защитный
 * отказ `webrtc-signal-guard`, и без записи в консоль деградацию не
 * отличить от нормальной работы. Звонок это не ломает — остальные пары
 * продолжают собираться, — поэтому ошибку не пробрасываем.
 */
function logSignalError(error: unknown): void {
  console.warn("[group-calls] handleSignal завершился с ошибкой", error);
}
