"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ChatCallKind,
  ChatCallSignal,
  ChatCallStatus,
  ChatCallStreamEvent,
  ChatIceServerDto,
  ChatStreamEvent,
} from "@vedamatch/shared";
import { API_URL, ApiError } from "@/lib/http-client";
import {
  acceptChatCall,
  declineChatCall,
  endChatCall,
  getActiveChatCall,
  getChatIceServers,
  sendChatCallSignal,
  startChatCall,
} from "@/lib/chat-calls-client";
import { subscribeToChat } from "@/lib/chat-stream";
import {
  IDLE_STATE,
  reduceCall,
  roleIn,
  type CallState,
} from "./call-machine";
import { CallSession } from "./webrtc-session";
import { startRingtone } from "./ringtone";
import { CallOverlay } from "./call-overlay";
import { IncomingCallBanner } from "./incoming-call-banner";

/**
 * Провайдер звонков. Живёт в layout портала: входящий должен показаться в
 * любом разделе, а не только в открытой беседе. Один на вкладку — второй
 * экземпляр означал бы два ответа на один входящий.
 *
 * Разделение труда: `call-machine` решает, что показывать; здесь — сеть
 * (POST'ы и общий поток событий) и `CallSession` (WebRTC и медиа).
 */

export interface ChatCallsApi {
  state: CallState;
  selfId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  start: (conversationId: string, kind: ChatCallKind) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  dismiss: () => void;
}

const ChatCallsContext = createContext<ChatCallsApi | null>(null);

export function useChatCalls(): ChatCallsApi | null {
  return useContext(ChatCallsContext);
}

/** Сколько экран «звонок завершён» висит сам, прежде чем уйти. */
const ENDED_AUTOCLOSE_MS = 3000;
/** Ошибка старта (занято, нет микрофона) показывается недолго и сама уходит. */
const ERROR_AUTOCLEAR_MS = 4000;

export function ChatCallProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reduceCall, IDLE_STATE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const stateRef = useRef(state);
  // Обработчики читают свежее состояние через ref: обновляем его после
  // каждой отрисовки, а не во время неё.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const sessionRef = useRef<CallSession | null>(null);
  const iceRef = useRef<ChatIceServerDto[] | null>(null);
  /** Сигналы, пришедшие раньше, чем поднялась сессия. */
  const queuedSignals = useRef<ChatCallSignal[]>([]);
  const stopRingtone = useRef<(() => void) | null>(null);

  const closeSession = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    queuedSignals.current = [];
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const iceServers = useCallback(async (): Promise<ChatIceServerDto[]> => {
    // Учётка TURN живёт десять минут: перед каждым звонком запрашиваем
    // свежую, а не держим одну на сессию.
    const res = await getChatIceServers();
    iceRef.current = res.iceServers;
    return res.iceServers;
  }, []);

  const finishLocally = useCallback(
    (status: ChatCallStatus, error?: string | null) => {
      dispatch({ type: "local-ended", status, error });
    },
    [],
  );

  /** Сообщить серверу о конце и закрыть медиа. Идемпотентно. */
  const hangUpWith = useCallback(
    async (reason: "hangup" | "network") => {
      const current = stateRef.current;
      const call = current.call;
      if (!call || current.phase === "idle" || current.phase === "ended") return;
      const relayed = (await sessionRef.current?.isRelayed()) ?? undefined;
      const localStatus: ChatCallStatus =
        current.phase === "incoming"
          ? "declined"
          : current.phase === "outgoing"
            ? "cancelled"
            : reason === "network"
              ? "failed"
              : "ended";
      finishLocally(localStatus);
      closeSession();
      try {
        if (current.phase === "incoming") await declineChatCall(call.id);
        else await endChatCall(call.id, { reason, relayed });
      } catch {
        // Сервер сам добьёт звонок таймером или по сигналу второй стороны.
      }
    },
    [closeSession, finishLocally],
  );

  const createSession = useCallback(
    (role: "caller" | "callee", servers: ChatIceServerDto[]) => {
      closeSession();
      const session = new CallSession(servers, role, {
        onSignal: (signal) => {
          const id = stateRef.current.call?.id;
          if (!id) return;
          void sendChatCallSignal(id, signal).catch(() => {
            // Потерянный кандидат не смертелен; потерянный SDP добьёт таймер обрыва.
          });
        },
        onRemoteStream: (stream) => setRemoteStream(stream),
        onConnected: () => dispatch({ type: "connected", at: Date.now() }),
        onDisconnected: () => dispatch({ type: "disconnected" }),
        onFailed: () => void hangUpWith("network"),
      });
      sessionRef.current = session;
      return session;
    },
    [closeSession, hangUpWith],
  );

  const drainQueuedSignals = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    for (const signal of queuedSignals.current.splice(0))
      await session.handleSignal(signal).catch(() => undefined);
  }, []);

  // ---------- общий поток событий ----------

  useEffect(() => {
    return subscribeToChat((event) => {
      if (!isCallEvent(event)) return;
      if (event.type === "call.signal") {
        if (event.callId !== stateRef.current.call?.id) return;
        const session = sessionRef.current;
        if (session) void session.handleSignal(event.signal).catch(() => undefined);
        else queuedSignals.current.push(event.signal);
        return;
      }
      dispatch({ type: "stream", event, selfId: userId });
      // Финал с сервера: медиа закрываем сразу, не дожидаясь перерисовки.
      if (event.type === "call.ended" && event.call.id === stateRef.current.call?.id)
        closeSession();
    });
  }, [userId, closeSession]);

  // Вкладку перезагрузили посреди звонка или входящего: спросить сервер.
  useEffect(() => {
    let cancelled = false;
    void getActiveChatCall()
      .then(({ call }) => {
        if (!cancelled && call) dispatch({ type: "restore", call, selfId: userId });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ---------- реакции на смену фазы ----------

  const role = roleIn(state, userId);


  // Гудки: входящему и исходящему, пока не ответили.
  useEffect(() => {
    if (state.phase === "incoming" || state.phase === "outgoing") {
      stopRingtone.current?.();
      stopRingtone.current = startRingtone(
        state.phase === "incoming" ? "incoming" : "outgoing",
      );
      return () => {
        stopRingtone.current?.();
        stopRingtone.current = null;
      };
    }
    stopRingtone.current?.();
    stopRingtone.current = null;
  }, [state.phase]);

  // Соединяемся: звонивший делает offer. Сессия у него уже есть с момента
  // нажатия «позвонить» (микрофон запрошен до того, как у собеседника
  // пошёл гудок); после перезагрузки страницы её надо поднять заново.
  useEffect(() => {
    if (state.phase !== "connecting" || role !== "caller") return;
    let cancelled = false;
    void (async () => {
      try {
        let session = sessionRef.current;
        if (!session) {
          const servers = iceRef.current ?? (await iceServers());
          session = createSession("caller", servers);
          setLocalStream(await session.startLocalMedia(state.call!.kind));
        }
        if (cancelled) return;
        await session.makeOffer();
        await drainQueuedSignals();
      } catch (error) {
        if (cancelled) return;
        closeSession();
        dispatch({ type: "failed", error: describeMediaError(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Только вход в фазу: state.call.kind в этот момент не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, role]);

  // Вызываемый после перезагрузки посреди разговора: поднять медиа и ждать
  // новый offer от звонившего (у него сработает перезапуск ICE).
  useEffect(() => {
    if (state.phase !== "connecting" || role !== "callee" || sessionRef.current)
      return;
    let cancelled = false;
    void (async () => {
      try {
        const servers = iceRef.current ?? (await iceServers());
        const session = createSession("callee", servers);
        setLocalStream(await session.startLocalMedia(state.call!.kind));
        if (!cancelled) await drainQueuedSignals();
      } catch (error) {
        if (cancelled) return;
        closeSession();
        dispatch({ type: "failed", error: describeMediaError(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, role]);

  // Финал: через пару секунд убрать экран. Медиа к этому моменту уже
  // закрыто тем, кто перевёл звонок в финал.
  useEffect(() => {
    if (state.phase !== "ended") return;
    const timer = setTimeout(() => dispatch({ type: "reset" }), ENDED_AUTOCLOSE_MS);
    return () => clearTimeout(timer);
  }, [state.phase]);

  // Ошибка старта в idle — краткое сообщение, потом тишина.
  useEffect(() => {
    if (state.phase !== "idle" || !state.error) return;
    const timer = setTimeout(() => dispatch({ type: "reset" }), ERROR_AUTOCLEAR_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.error]);

  // Закрыли вкладку посреди звонка: сообщить серверу, не дожидаясь таймера.
  useEffect(() => {
    const onUnload = () => {
      const current = stateRef.current;
      if (!current.call || current.phase === "idle" || current.phase === "ended")
        return;
      const path =
        current.phase === "incoming"
          ? `/chat/calls/${current.call.id}/decline`
          : `/chat/calls/${current.call.id}/end`;
      void fetch(`${API_URL}${path}`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "hangup" }),
      }).catch(() => undefined);
      sessionRef.current?.close();
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  // Синхронизация выключателей с дорожками.
  useEffect(() => {
    sessionRef.current?.setMuted(state.muted);
  }, [state.muted, localStream]);
  useEffect(() => {
    sessionRef.current?.setCameraOff(state.cameraOff);
  }, [state.cameraOff, localStream]);

  // ---------- действия ----------

  const start = useCallback(
    async (conversationId: string, kind: ChatCallKind) => {
      if (stateRef.current.phase !== "idle") return;
      try {
        // Микрофон — до звонка: отказ в доступе не должен будить собеседника.
        const servers = await iceServers();
        const session = createSession("caller", servers);
        setLocalStream(await session.startLocalMedia(kind));
        const call = await startChatCall(conversationId, kind);
        dispatch({ type: "outgoing-started", call });
      } catch (error) {
        closeSession();
        dispatch({
          type: "failed",
          error:
            error instanceof ApiError ? error.message : describeMediaError(error),
        });
      }
    },
    [closeSession, createSession, iceServers],
  );

  const accept = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== "incoming") return;
    try {
      const servers = await iceServers();
      const session = createSession("callee", servers);
      setLocalStream(await session.startLocalMedia(call.kind));
      dispatch({ type: "accepting" });
      await acceptChatCall(call.id);
      await drainQueuedSignals();
    } catch (error) {
      closeSession();
      const message =
        error instanceof ApiError ? error.message : describeMediaError(error);
      // Микрофон не дали — звонок для нас кончился, а собеседнику скажем.
      finishLocally("declined", message);
      void declineChatCall(call.id).catch(() => undefined);
    }
  }, [closeSession, createSession, drainQueuedSignals, finishLocally, iceServers]);

  const decline = useCallback(() => hangUpWith("hangup"), [hangUpWith]);
  const hangUp = useCallback(() => hangUpWith("hangup"), [hangUpWith]);
  const toggleMute = useCallback(() => dispatch({ type: "toggle-mute" }), []);
  const toggleCamera = useCallback(() => dispatch({ type: "toggle-camera" }), []);
  const dismiss = useCallback(() => dispatch({ type: "reset" }), []);

  // Пришли из уведомления с кнопкой «Ответить» или «Отклонить»: сервис-воркер
  // не знает адреса API и передал решение меткой в адресе страницы.
  const pendingAction = useRef<"answer" | "decline" | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("callAction");
    if (action !== "answer" && action !== "decline") return;
    pendingAction.current = action;
    params.delete("callAction");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);
  useEffect(() => {
    if (state.phase !== "incoming" || !pendingAction.current) return;
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action === "answer") void accept();
    else void decline();
  }, [state.phase, accept, decline]);

  const api = useMemo<ChatCallsApi>(
    () => ({
      state,
      selfId: userId,
      localStream,
      remoteStream,
      start,
      accept,
      decline,
      hangUp,
      toggleMute,
      toggleCamera,
      dismiss,
    }),
    [
      state,
      userId,
      localStream,
      remoteStream,
      start,
      accept,
      decline,
      hangUp,
      toggleMute,
      toggleCamera,
      dismiss,
    ],
  );

  return (
    <ChatCallsContext.Provider value={api}>
      {children}
      <IncomingCallBanner />
      <CallOverlay />
    </ChatCallsContext.Provider>
  );
}

function isCallEvent(event: ChatStreamEvent): event is ChatCallStreamEvent {
  return event.type.startsWith("call.");
}

/** Отказ в доступе к микрофону и прочие ошибки медиа — словами. */
function describeMediaError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Нет доступа к микрофону или камере — разрешите его в настройках браузера";
  if (name === "NotFoundError")
    return "Микрофон или камера не найдены";
  if (name === "NotReadableError")
    return "Микрофон или камера заняты другим приложением";
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось начать звонок";
}
