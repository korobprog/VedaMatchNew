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
import { AppState, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, type MediaStream } from 'react-native-webrtc';
import type {
  ChatCallSignal,
  ChatGroupCallDto,
  ChatIceServerDto,
  ChatStreamEvent,
} from '@vedamatch/shared';
import { useSession } from '@/lib/auth/session';
import { useChatStream } from '@/lib/chat/chat-stream';
import { createChatCallsApi } from '@/lib/calls/chat-calls-client';
import { describeMediaError } from '@/lib/calls/call-media-error';
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
import { planPeers } from './group-call-peers';
import {
  IDLE_GROUP_CALL_STATE,
  reduceGroupCall,
  type GroupCallState,
} from './group-call-state';
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

/** Как часто подтверждаем присутствие (сервер ждёт три таких срока). */
const HEARTBEAT_MS = 15_000;
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
  const iceServers = useRef<ChatIceServerDto[]>([]);
  const sendQueue = useRef(new SignalSendQueue());
  const seqState = useRef<SignalSeqState>(INITIAL_SIGNAL_SEQ_STATE);
  const speaking = useRef<SpeakingState>(EMPTY_SPEAKING_STATE);

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
        onRemoteStream: () => {
          // Звук играет сам через нативный аудиовыход WebRTC — отдельный
          // элемент воспроизведения нужен только вебу (`remote-audio-playback.ts`).
        },
        onStateChange: (peerState) =>
          dispatch({ type: 'peer-state', userId: peerId, state: peerState }),
      });
      links.current.set(peerId, link);
      return link;
    },
    [sendSignal],
  );

  const closeLink = useCallback((peerId: string) => {
    links.current.get(peerId)?.close();
    links.current.delete(peerId);
  }, []);

  const closeAllLinks = useCallback(() => {
    for (const link of links.current.values()) link.close();
    links.current.clear();
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
    speaking.current = EMPTY_SPEAKING_STATE;
    seqState.current = INITIAL_SIGNAL_SEQ_STATE;
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
      dispatch({ type: 'joined', call, at: Date.now() });
      reconcilePeers(call);
      router.push(`/group-call/${call.id}`);
    },
    [callsApi, reconcilePeers],
  );

  const startOrJoin = useCallback(
    async (conversationId: string) => {
      if (stateRef.current.phase === 'active' || stateRef.current.phase === 'joining')
        return;
      dispatch({ type: 'joining' });
      try {
        await enterRoom(await groupApi.start(conversationId));
      } catch (error) {
        teardown();
        dispatch({ type: 'failed', error: describeMediaError(error, Platform.OS) });
      }
    },
    [enterRoom, groupApi, teardown],
  );

  const join = useCallback(
    async (callId: string) => {
      if (stateRef.current.phase === 'active' || stateRef.current.phase === 'joining')
        return;
      dispatch({ type: 'joining' });
      try {
        await enterRoom(await groupApi.join(callId));
      } catch (error) {
        teardown();
        dispatch({ type: 'failed', error: describeMediaError(error, Platform.OS) });
      }
    },
    [enterRoom, groupApi, teardown],
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
          dispatch({ type: 'stream', event: { type: 'group-call.updated', call: fresh }, selfId: userId });
          reconcilePeers(fresh);
        })
        .catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [groupApi, reconcilePeers, state.call, state.phase, userId]);

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
      reportScreenMounted: setScreenVisible,
      dismiss,
    }),
    [
      callInConversation,
      dismiss,
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
      <GroupCallBanner visible={!screenVisible} />
    </GroupCallsContext.Provider>
  );
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
