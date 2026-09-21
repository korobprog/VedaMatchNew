"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
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
  startGroupCall,
} from "@/lib/chat-group-calls-client";
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

  const links = useRef(new Map<string, GroupPeerLink>());
  const localStream = useRef<MediaStream | null>(null);
  const iceServers = useRef<ChatIceServerDto[]>([]);
  const sendQueue = useRef(new SignalSendQueue());
  const seqState = useRef<SignalSeqState>(INITIAL_SIGNAL_SEQ_STATE);
  const speaking = useRef<SpeakingState>(EMPTY_SPEAKING_STATE);
  const heartbeatFailures = useRef(0);

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
          onStateChange: (peerState) =>
            dispatch({ type: "peer-state", userId: peerId, state: peerState }),
        },
      );
      links.current.set(peerId, link);
      return link;
    },
    [sendSignal],
  );

  const closeLink = useCallback((peerId: string) => {
    links.current.get(peerId)?.close();
    links.current.delete(peerId);
    setRemoteStreams((current) => {
      if (!(peerId in current)) return current;
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const closeAllLinks = useCallback(() => {
    for (const link of links.current.values()) link.close();
    links.current.clear();
    setRemoteStreams({});
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
    },
    [closeLink, linkFor, userId],
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
  }, [reconcilePeers, state.call, state.phase, teardown, userId]);

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
      setExpanded,
      dismiss,
    }),
    [
      callInConversation,
      dismiss,
      expanded,
      join,
      leave,
      startOrJoin,
      state,
      toggleMute,
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
