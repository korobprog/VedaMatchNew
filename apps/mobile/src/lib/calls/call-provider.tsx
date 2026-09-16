import { router } from 'expo-router';
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
} from 'react';
import { AppState } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import type { MediaStream } from 'react-native-webrtc';
import type {
  ChatCallKind,
  ChatCallSignal,
  ChatCallStatus,
  ChatCallStreamEvent,
  ChatIceServerDto,
  ChatStreamEvent,
} from '@vedamatch/shared';
import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { useChatStream } from '@/lib/chat/chat-stream';
import { CallErrorToast } from '@/components/calls/call-error-toast';
import { IncomingCallBanner } from '@/components/calls/incoming-call-banner';
import { ReturnToCallBanner } from '@/components/calls/return-to-call-banner';
import { createChatCallsApi } from './chat-calls-client';
import { isAudioSessionLive } from './audio-session-policy';
import { shouldDeclineAsBusy } from './call-busy-decision';
import { IDLE_STATE, companionOf, reduceCall, roleIn, type CallState } from './call-machine';
import { shouldRestartIceOnNetworkChange } from './ice-restart-policy';
import {
  clearNativeCall,
  consumeLaunchCall,
  getCallConflictState,
  placeOutgoingCall,
  startOngoingCall,
  subscribeToNativeCallEvents,
  subscribeToNetworkTransportChanges,
} from './native-call-bridge';
import { navigatedCallIdAfterPhase, nextNavigatedCallId, shouldAutoNavigateToCallScreen } from './call-screen-return';
import { PendingCallAnswer } from './pending-call-answer';
import { startRingtone } from './ringtone';
import { CallSession } from './webrtc-session';
import type { NetworkTransport } from '../../../modules/vedamatch-calls';

/**
 * Провайдер звонков — перенос `apps/web/src/components/chat/calls/call-provider.tsx`.
 * Живёт в корневом layout (`_layout.tsx`): входящий должен показаться в
 * любом разделе, а не только в открытой беседе. Один на приложение — второй
 * экземпляр означал бы два ответа на один входящий.
 *
 * Разделение труда то же, что на сайте: `call-machine` решает, что
 * показывать; здесь — сеть (запросы и общий поток `chat-stream.tsx`) и
 * `CallSession` (WebRTC и медиа). Экран звонка (`app/call/[id].tsx`) и
 * баннер входящего (`components/calls/incoming-call-banner.tsx`) читают
 * состояние отсюда, а не хранят своё.
 */

export interface ChatCallsApi {
  state: CallState;
  selfId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Пошёл ли разговор через TURN — обновляется, пока `phase === 'active'`. */
  relayed: boolean | null;
  /**
   * Открыт ли сейчас полноэкранный `app/call/[id].tsx`. Системное «назад»
   * снимает этот экран (feedback-001.md, блокирующий пункт 1), но не
   * завершает звонок — `screenVisible` даёт `ReturnToCallBanner` понять,
   * что показать плашку «вернуться» (`call-screen-return.ts`).
   */
  screenVisible: boolean;
  /** Экран звонка вызывает при монтировании/размонтировании. */
  reportCallScreenMounted: (visible: boolean) => void;
  start: (conversationId: string, kind: ChatCallKind) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  dismiss: () => void;
}

const ChatCallsContext = createContext<ChatCallsApi | null>(null);

export function useChatCalls(): ChatCallsApi | null {
  return useContext(ChatCallsContext);
}

/** Сколько экран «звонок завершён» висит сам, прежде чем уйти. */
const ENDED_AUTOCLOSE_MS = 3000;
/** Ошибка старта (занято, нет микрофона) показывается недолго и сама уходит. */
const ERROR_AUTOCLEAR_MS = 5000;
/** Как часто перечитывать статистику relay во время разговора. */
const RELAY_POLL_MS = 5000;

export function CallProvider({ children }: { children: ReactNode }) {
  const { status, api, user } = useSession();
  const stream = useChatStream();
  const callsApi = useMemo(() => createChatCallsApi(api), [api]);
  const userId = user?.id ?? '';

  const [state, dispatch] = useReducer(reduceCall, IDLE_STATE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [relayed, setRelayed] = useState<boolean | null>(null);
  const [screenVisible, setScreenVisible] = useState(false);

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
  /**
   * Для какого звонка экран уже поднимался хоть раз — решает
   * `shouldAutoNavigateToCallScreen`/`nextNavigatedCallId`
   * (`call-screen-return.ts`). Раньше сбрасывался в `null` при уходе
   * экрана («назад»), что и было гонкой из `feedback-002.md`: следующая
   * смена фазы принудительно открывала экран заново, без участия
   * пользователя. Теперь метка меняется только через `nextNavigatedCallId`
   * — при уходе с экрана она не сбрасывается.
   */
  const navigatedCallId = useRef<string | null>(null);

  const reportCallScreenMounted = useCallback((visible: boolean) => {
    setScreenVisible(visible);
    navigatedCallId.current = nextNavigatedCallId(visible, stateRef.current.call?.id ?? null, navigatedCallId.current);
  }, []);

  /**
   * Для какого звонка человек сам нажал «Ответить» на этом устройстве —
   * читает `shouldAutoNavigateToCallScreen` для решения об `ended`
   * (`feedback-003.md`): обычный пропущенный/отменённый/отвеченный на
   * другом устройстве входящий не должен принудительно поднимать экран,
   * а отказ дать микрофон/камеру сразу после «Ответить» — должен, иначе
   * причина финала останется необъяснённой. Ставится в начале `accept()`,
   * до `await`, поэтому отражает факт нажатия, а не то, успел ли локально
   * дойти до фазы `connecting`.
   */
  const answerAttemptCallId = useRef<string | null>(null);

  const closeSession = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    queuedSignals.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setRelayed(null);
  }, []);

  const iceServers = useCallback(async (): Promise<ChatIceServerDto[]> => {
    // Учётка TURN живёт десять минут: перед каждым звонком запрашиваем
    // свежую, а не держим одну на сессию.
    const res = await callsApi.iceServers();
    iceRef.current = res.iceServers;
    return res.iceServers;
  }, [callsApi]);

  const finishLocally = useCallback((status: ChatCallStatus, error?: string | null) => {
    dispatch({ type: 'local-ended', status, error });
  }, []);

  /** Сообщить серверу о конце и закрыть медиа. Идемпотентно. */
  const hangUpWith = useCallback(
    async (reason: 'hangup' | 'network') => {
      const current = stateRef.current;
      const call = current.call;
      if (!call || current.phase === 'idle' || current.phase === 'ended') return;
      const wasRelayed = (await sessionRef.current?.isRelayed()) ?? undefined;
      const localStatus: ChatCallStatus =
        current.phase === 'incoming'
          ? 'declined'
          : current.phase === 'outgoing'
            ? 'cancelled'
            : reason === 'network'
              ? 'failed'
              : 'ended';
      finishLocally(localStatus);
      closeSession();
      try {
        if (current.phase === 'incoming') await callsApi.decline(call.id);
        else await callsApi.end(call.id, { reason, relayed: wasRelayed });
      } catch {
        // Сервер сам добьёт звонок таймером или по сигналу второй стороны.
      }
    },
    [callsApi, closeSession, finishLocally],
  );

  const createSession = useCallback(
    (role: 'caller' | 'callee', servers: ChatIceServerDto[]) => {
      closeSession();
      const session = new CallSession(servers, role, {
        onSignal: (signal) => {
          const id = stateRef.current.call?.id;
          if (!id) return;
          void callsApi.signal(id, signal).catch(() => {
            // Потерянный кандидат не смертелен; потерянный SDP добьёт таймер обрыва.
          });
        },
        onRemoteStream: (remote) => setRemoteStream(remote),
        onConnected: () => dispatch({ type: 'connected', at: Date.now() }),
        onDisconnected: () => dispatch({ type: 'disconnected' }),
        onFailed: () => void hangUpWith('network'),
      });
      sessionRef.current = session;
      return session;
    },
    [callsApi, closeSession, hangUpWith],
  );

  const drainQueuedSignals = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    for (const signal of queuedSignals.current.splice(0))
      await session.handleSignal(signal).catch(() => undefined);
  }, []);

  // ---------- общий поток событий ----------

  useEffect(() => {
    if (status !== 'signed') return;
    return stream.subscribe((event) => {
      if (!isCallEvent(event)) return;
      if (event.type === 'call.signal') {
        if (event.callId !== stateRef.current.call?.id) return;
        const session = sessionRef.current;
        if (session) void session.handleSignal(event.signal).catch(() => undefined);
        else queuedSignals.current.push(event.signal);
        return;
      }
      dispatch({ type: 'stream', event, selfId: userId });
      // Финал с сервера: медиа закрываем сразу, не дожидаясь перерисовки.
      if (event.type === 'call.ended' && event.call.id === stateRef.current.call?.id)
        closeSession();
    });
  }, [status, stream, userId, closeSession]);

  /**
   * Звонок, о котором думает сервер, — при первом входе и при каждой
   * пересинхронизации потока (приложение вернулось из фона: пока оно было
   * свёрнуто, поток событий был закрыт, `lib/chat/chat-stream.tsx`).
   * Если сервер не знает о звонке, который мы ещё считаем живым, — он
   * закончился, пока мы не смотрели.
   */
  const reconcile = useCallback(async () => {
    if (status !== 'signed') return;
    try {
      const { call: activeCall } = await callsApi.active();
      if (activeCall) {
        if (stateRef.current.phase === 'idle') dispatch({ type: 'restore', call: activeCall, selfId: userId });
        return;
      }
      const current = stateRef.current;
      if (current.call && current.phase !== 'idle' && current.phase !== 'ended') {
        finishLocally('ended');
        closeSession();
      }
    } catch {
      // Сеть — следующая пересинхронизация попробует снова.
    }
  }, [status, callsApi, userId, finishLocally, closeSession]);

  useEffect(() => {
    void reconcile();
  }, [reconcile]);

  useEffect(() => {
    if (status !== 'signed') return;
    return stream.onResync(() => void reconcile());
  }, [status, stream, reconcile]);

  // ---------- реакции на смену фазы ----------

  const role = roleIn(state, userId);

  // Гудки: входящему и исходящему, пока не ответили.
  useEffect(() => {
    if (state.phase === 'incoming' || state.phase === 'outgoing') {
      stopRingtone.current?.();
      stopRingtone.current = startRingtone(state.phase === 'incoming' ? 'incoming' : 'outgoing');
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
  // пошёл гудок); после перезапуска приложения её надо поднять заново.
  useEffect(() => {
    if (state.phase !== 'connecting' || role !== 'caller') return;
    let cancelled = false;
    void (async () => {
      try {
        let session = sessionRef.current;
        if (!session) {
          const servers = iceRef.current ?? (await iceServers());
          session = createSession('caller', servers);
          setLocalStream(await session.startLocalMedia(state.call!.kind));
        }
        if (cancelled) return;
        await session.makeOffer();
        await drainQueuedSignals();
      } catch (error) {
        if (cancelled) return;
        closeSession();
        dispatch({ type: 'failed', error: describeMediaError(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Только вход в фазу: state.call.kind в этот момент не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, role]);

  // Вызываемый после перезапуска посреди разговора: поднять медиа и ждать
  // новый offer от звонившего (у него сработает перезапуск ICE).
  useEffect(() => {
    if (state.phase !== 'connecting' || role !== 'callee' || sessionRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const servers = iceRef.current ?? (await iceServers());
        const session = createSession('callee', servers);
        setLocalStream(await session.startLocalMedia(state.call!.kind));
        if (!cancelled) await drainQueuedSignals();
      } catch (error) {
        if (cancelled) return;
        closeSession();
        dispatch({ type: 'failed', error: describeMediaError(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, role]);

  // Разговор идёт: раз в несколько секунд смотрим, не пошёл ли звук через
  // ретранслятор — для пометки на экране звонка (`app/call/[id].tsx`).
  useEffect(() => {
    if (state.phase !== 'active') return;
    let cancelled = false;
    const poll = () => {
      void sessionRef.current?.isRelayed().then((value) => {
        if (!cancelled) setRelayed(value);
      });
    };
    poll();
    const timer = setInterval(poll, RELAY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.phase]);

  // Финал: через пару секунд убрать экран. Медиа к этому моменту уже
  // закрыто тем, кто перевёл звонок в финал.
  useEffect(() => {
    if (state.phase !== 'ended') return;
    const timer = setTimeout(() => dispatch({ type: 'reset' }), ENDED_AUTOCLOSE_MS);
    return () => clearTimeout(timer);
  }, [state.phase]);

  // Ошибка старта в idle — недолгое сообщение, потом тишина.
  useEffect(() => {
    if (state.phase !== 'idle' || !state.error) return;
    const timer = setTimeout(() => dispatch({ type: 'reset' }), ERROR_AUTOCLEAR_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.error]);

  // Свернули приложение посреди звонка: сообщить серверу, не дожидаясь
  // таймера сервера (по аналогии с `pagehide` на сайте). Поток событий уже
  // закрылся сам (`chat-stream.tsx`) — вернувшись, `reconcile()` выше
  // подхватит любой пропущенный финал со стороны собеседника.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'background') return;
      const current = stateRef.current;
      if (!current.call || current.phase === 'idle' || current.phase === 'ended') return;
      if (current.phase === 'incoming') void callsApi.decline(current.call.id).catch(() => undefined);
    });
    return () => sub.remove();
  }, [callsApi]);

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
      if (stateRef.current.phase !== 'idle') return;
      // VED-222, п.7: то же «занято», что и для входящего (`native-call-bridge.ts`,
      // `handleIncomingCallPush`) — до getUserMedia/сети, отказ должен быть
      // мгновенным и понятным, а не тихим зависанием на «Вызов…».
      if (shouldDeclineAsBusy(getCallConflictState())) {
        dispatch({ type: 'failed', error: 'Устройство сейчас занято другим звонком' });
        return;
      }
      try {
        // Микрофон/камера — до звонка: отказ в доступе не должен будить собеседника.
        const servers = await iceServers();
        const session = createSession('caller', servers);
        setLocalStream(await session.startLocalMedia(kind));
        const call = await callsApi.start(conversationId, kind);
        dispatch({ type: 'outgoing-started', call });
      } catch (error) {
        closeSession();
        dispatch({
          type: 'failed',
          error: error instanceof ApiError ? error.message : describeMediaError(error),
        });
      }
    },
    [callsApi, closeSession, createSession, iceServers],
  );

  const accept = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== 'incoming') return;
    answerAttemptCallId.current = call.id;
    try {
      const servers = await iceServers();
      const session = createSession('callee', servers);
      setLocalStream(await session.startLocalMedia(call.kind));
      dispatch({ type: 'accepting' });
      await callsApi.accept(call.id);
      await drainQueuedSignals();
    } catch (error) {
      closeSession();
      const message = error instanceof ApiError ? error.message : describeMediaError(error);
      // Микрофон/камеру не дали — звонок для нас кончился, а собеседнику скажем.
      finishLocally('declined', message);
      void callsApi.decline(call.id).catch(() => undefined);
    }
  }, [callsApi, closeSession, createSession, drainQueuedSignals, finishLocally, iceServers]);

  const decline = useCallback(() => hangUpWith('hangup'), [hangUpWith]);
  const hangUp = useCallback(() => hangUpWith('hangup'), [hangUpWith]);
  const toggleMute = useCallback(() => dispatch({ type: 'toggle-mute' }), []);
  const toggleCamera = useCallback(() => dispatch({ type: 'toggle-camera' }), []);
  const switchCamera = useCallback(() => sessionRef.current?.switchCamera(), []);
  const dismiss = useCallback(() => dispatch({ type: 'reset' }), []);

  // ---------- нативный модуль звонков (VED-221) ----------

  /**
   * Отложенный ответ (`feedback-001.md`, блокирующий п.2): нажатие
   * «Ответить» на уведомлении/блокировке при свёрнутом, но НЕ убитом,
   * приложении шлёт JS-событие `answer` синхронно — раньше, чем поток
   * событий переоткроется (`chat-stream.tsx`) и `reconcile()` (эффект
   * выше) успеет узнать звонок через `/chat/calls/active`. Раньше здесь
   * стоял точный guard `phase === 'incoming'` в момент события — тот
   * промахивался почти всегда, событие терялось безвозвратно, и человеку
   * приходилось нажимать «Ответить» второй раз уже внутри приложения.
   * `PendingCallAnswer` (`pending-call-answer.ts`) запоминает `callId` до
   * тех пор, пока звонок не появится в состоянии — из холодного старта
   * (`getLaunchCall()`) и из события `answer`, пока JS уже жив, — единая
   * очередь на оба пути, поэтому одновременное срабатывание обоих не даёт
   * двойной `accept()` (см. spec `pending-call-answer.spec.ts`).
   */
  const pendingAnswer = useRef(new PendingCallAnswer()).current;
  useEffect(() => {
    const launch = consumeLaunchCall();
    if (launch?.action === 'answer') pendingAnswer.request(launch.callId);
  }, [pendingAnswer]);
  // Звонок появился в состоянии (реконсайл или call.ringing из потока) —
  // если на него есть отложенный ответ, принять его самим, без второго
  // нажатия человеком.
  useEffect(() => {
    if (state.phase !== 'incoming' || !state.call) return;
    if (!pendingAnswer.consume(state.call.id)) return;
    void accept();
  }, [state.phase, state.call, accept, pendingAnswer]);

  // Ответ/отклонение системным путём (гарнитура, Bluetooth, Android Auto,
  // а для убитого приложения — сюда же приходит и наша кнопка в
  // уведомлении, `CallActionReceiver.kt` шлёт `answer` синхронно с
  // запуском Activity), пока JS жив.
  useEffect(() => {
    return subscribeToNativeCallEvents({
      onAnswer: (callId) => {
        const current = stateRef.current;
        if (current.call?.id === callId && current.phase === 'incoming') {
          void accept();
          return;
        }
        // Стрима с этим звонком ещё нет (типичный случай «свёрнуто, не
        // убито» — поток закрылся в фоне) — запомнить и сразу спросить
        // сервер, не дожидаясь обычного ресинка по AppState.
        pendingAnswer.request(callId);
        void reconcile();
      },
      onDecline: (callId) => {
        if (stateRef.current.call?.id === callId) void decline();
      },
      // VED-222: гарнитура/Bluetooth/Android Auto во время разговора или
      // кнопка «Завершить» на постоянном уведомлении — обычный hangUp, тот
      // же путь, что кнопка на самом экране звонка.
      onEnd: (callId) => {
        if (stateRef.current.call?.id === callId) void hangUp();
      },
    });
  }, [accept, decline, hangUp, pendingAnswer, reconcile]);

  // VED-222, п.1: система должна знать про исходящий разговор так же, как
  // про входящий (`TelecomManager.placeCall`) — регистрируем один раз, как
  // только у звонка появились гудки. Best-effort (см. `native-call-bridge.ts`):
  // WebRTC-дозвон от результата не зависит.
  const placedOutgoingFor = useRef<string | null>(null);
  useEffect(() => {
    const call = state.call;
    if (!call || state.phase !== 'outgoing') return;
    if (placedOutgoingFor.current === call.id) return;
    placedOutgoingFor.current = call.id;
    void placeOutgoingCall(call.id, companionOf(call, userId).name, call.kind);
  }, [state.phase, state.call, userId]);

  // VED-222, п.1: разговор пошёл — служба переднего плана с постоянным
  // уведомлением «Идёт звонок» и (если self-managed `Connection`
  // регистрировался — исходящий всегда, входящий из push почти всегда, см.
  // `docs/mobile-calls-native.md` §12) перевод его в активное состояние.
  // Один раз на звонок, независимо от того, сработает ли ниже эффект
  // очистки при `ended` — это два независимых события жизненного цикла, не
  // взаимоисключающие ветки одного «либо-либо», как было раньше (стадия 2:
  // тогда единственный `nativeClearedFor` гасил self-managed `Connection`
  // ровно в момент, когда разговор только начинался — ошибка, которую
  // стадия 3 и должна была исправить).
  const startedOngoingFor = useRef<string | null>(null);
  useEffect(() => {
    const call = state.call;
    if (!call || state.phase !== 'active') return;
    if (startedOngoingFor.current === call.id) return;
    startedOngoingFor.current = call.id;
    void startOngoingCall(call.id, companionOf(call, userId).name, call.kind);
  }, [state.phase, state.call, userId]);

  // Гасит уведомление/self-managed Connection и службу переднего плана, как
  // только звонок внутри приложения закончился — независимо от того, дошёл
  // ли он до `active` (исходящий, отменённый до ответа, тоже должен снять
  // с Telecom регистрацию, сделанную выше).
  const nativeClearedFor = useRef<string | null>(null);
  useEffect(() => {
    const call = state.call;
    if (!call || state.phase !== 'ended') return;
    if (nativeClearedFor.current === call.id) return;
    nativeClearedFor.current = call.id;
    void clearNativeCall(call.id, nativeEndReason(state.phase, state.endedStatus));
  }, [state.phase, state.call, state.endedStatus]);

  /**
   * Аудиосессия (`InCallManager.start()`/`stop()`) — исправление
   * `feedback-001.md`, блокирующий п.1: раньше жила в `useEffect`
   * `app/call/[id].tsx` с cleanup на размонтирование экрана, а экран умеет
   * сворачиваться по «назад» ВО ВРЕМЯ активного разговора, не завершая его
   * (`call-screen-return.ts`, `backMinimizesCall`) — в этот момент
   * `InCallManager.stop()` реально срабатывал и снимал аудиофокус,
   * `MODE_IN_COMMUNICATION`, Bluetooth SCO/гарнитуру и датчик приближения,
   * хотя разговор (служба переднего плана, self-managed `Connection`)
   * продолжал идти. Теперь следует за фазой звонка тем же паттерном, что уже
   * применён для `CallForegroundService`/`Connection` выше: один
   * `start()` на весь `connecting`→`active`, один `stop()` на выходе из этого
   * окна (`isAudioSessionLive`, `audio-session-policy.ts`, +spec). Экран
   * звонка (`app/call/[id].tsx`) больше не вызывает `start()`/`stop()` вовсе
   * — только маршрут (громкая/динамик/Bluetooth) и датчик приближения,
   * которые осмысленны лишь пока сам экран виден.
   */
  const audioSessionLive = useRef(false);
  useEffect(() => {
    const call = state.call;
    const live = call ? isAudioSessionLive(state.phase) : false;
    if (live && !audioSessionLive.current) {
      audioSessionLive.current = true;
      InCallManager.start({ media: call!.kind });
    } else if (!live && audioSessionLive.current) {
      audioSessionLive.current = false;
      InCallManager.stop();
    }
  }, [state.phase, state.call]);
  // Провайдер живёт в корневом layout и обычно не размонтируется, но на
  // всякий случай (быстрый logout/выход) не оставлять аудиосессию висеть.
  useEffect(
    () => () => {
      if (audioSessionLive.current) {
        audioSessionLive.current = false;
        InCallManager.stop();
      }
    },
    [],
  );

  // VED-222, п.6: смена сети (Wi-Fi ↔ LTE) во время разговора — перезапуск
  // ICE немедленно, не дожидаясь таймера обрыва (`ice-restart-policy.ts`,
  // спека там же документирует асимметрию «только звонящий»). Дебаунс
  // (`lastIceRestartAt`, исправление `feedback-001.md` этого этапа,
  // non-blocking п.1) — отдельно от флага «уже идёт» внутри самой сессии
  // (`webrtc-session.ts#restartIce`): один защищает от частой смены
  // транспорта на границе покрытия, другой — от параллельного вызова.
  const lastTransport = useRef<NetworkTransport | null>(null);
  const lastIceRestartAt = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'active') {
      lastTransport.current = null;
      lastIceRestartAt.current = null;
    }
  }, [state.phase]);
  useEffect(() => {
    return subscribeToNetworkTransportChanges((transport) => {
      const previous = lastTransport.current;
      lastTransport.current = transport;
      const now = Date.now();
      if (
        shouldRestartIceOnNetworkChange(stateRef.current.phase, role ?? 'callee', previous, transport, now, lastIceRestartAt.current)
      ) {
        lastIceRestartAt.current = now;
        void sessionRef.current?.restartIce();
      }
    });
  }, [role]);

  const apiValue = useMemo<ChatCallsApi>(
    () => ({
      state,
      selfId: userId,
      localStream,
      remoteStream,
      relayed,
      screenVisible,
      reportCallScreenMounted,
      start,
      accept,
      decline,
      hangUp,
      toggleMute,
      toggleCamera,
      switchCamera,
      dismiss,
    }),
    [
      state,
      userId,
      localStream,
      remoteStream,
      relayed,
      screenVisible,
      reportCallScreenMounted,
      start,
      accept,
      decline,
      hangUp,
      toggleMute,
      toggleCamera,
      switchCamera,
      dismiss,
    ],
  );

  // Как только у звонка есть телефонный экран (гудки или соединение), он
  // виден отдельным маршрутом — там видео на весь экран и кнопки. Баннер
  // входящего (см. `IncomingCallBanner`) остаётся баннером: два жеста
  // «ответить/отклонить» не заслуживают целого экрана до того, как решение
  // принято. Пушим не при каждой смене фазы, а по решению
  // `shouldAutoNavigateToCallScreen` (`call-screen-return.ts`) — один раз на
  // звонок: если пользователь уже видел экран и свернул его «назад», смена
  // фазы (собеседник ответил, пока человек в другом разделе) не должна
  // выдёргивать его обратно без действия с его стороны (`feedback-002.md`).
  // `navigatedCallId` объявлен выше, у остальных ref.
  useEffect(() => {
    const call = state.call;
    const callId = call?.id ?? null;
    const answerAttempted = callId !== null && answerAttemptCallId.current === callId;
    if (shouldAutoNavigateToCallScreen(state.phase, callId, navigatedCallId.current, answerAttempted)) {
      navigatedCallId.current = callId;
      router.push({ pathname: '/call/[id]', params: { id: callId! } });
      return;
    }
    // Фаза совсем вне «экрану есть что показывать» (idle/incoming) — метка
    // прошлого звонка больше ничего не решает (`navigatedCallIdAfterPhase`,
    // `call-screen-return.ts`).
    navigatedCallId.current = navigatedCallIdAfterPhase(state.phase, navigatedCallId.current);
  }, [state.phase, state.call]);

  return (
    <ChatCallsContext.Provider value={apiValue}>
      {children}
      <IncomingCallBanner />
      <ReturnToCallBanner />
      <CallErrorToast />
    </ChatCallsContext.Provider>
  );
}

function isCallEvent(event: ChatStreamEvent): event is ChatCallStreamEvent {
  return event.type.startsWith('call.');
}

/** `ChatCallStatus` сервера → причина для нативного модуля
 *  (`EndCallReason`, `native-call-bridge.ts`) — наборы почти совпадают,
 *  кроме `ringing`/`accepted` (звонок в этих статусах не гасят) и
 *  `answered_elsewhere` (сервер отдельно шлёт его только data-пушем,
 *  не в `ChatCallDto.status`, — до провайдера он этим путём не доходит). */
function nativeEndReason(phase: CallState['phase'], status: CallState['endedStatus']): 'ended' | 'declined' | 'missed' | 'cancelled' | 'failed' {
  if (phase === 'active') return 'ended';
  switch (status) {
    case 'declined':
    case 'missed':
    case 'cancelled':
    case 'failed':
      return status;
    default:
      return 'ended';
  }
}

/** Отказ в доступе к микрофону/камере и прочие ошибки медиа — словами. */
function describeMediaError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Нет доступа к микрофону или камере — разрешите его в настройках телефона';
  if (name === 'NotFoundError') return 'Микрофон или камера не найдены';
  if (name === 'NotReadableError') return 'Микрофон или камера заняты другим приложением';
  if (error instanceof Error && error.message) return error.message;
  return 'Не удалось начать звонок';
}
