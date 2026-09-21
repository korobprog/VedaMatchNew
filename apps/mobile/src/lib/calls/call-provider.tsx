import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
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
import { decideBackgroundIncomingAction } from './call-app-background-policy';
import { shouldDeclineAsBusy } from './call-busy-decision';
import { ChatCallsContext, type ChatCallsApi } from './chat-calls-context';
import { describeMediaError } from './call-media-error';
import { buildLaunchPreviewCall } from './call-launch-preview';
import { CONNECTING_TIMEOUT_MS, decideConnectingTimeout } from './call-connect-timeout';
import { IDLE_STATE, companionOf, reduceCall, roleIn, type CallState } from './call-machine';
import {
  admitCallSignal,
  INITIAL_SIGNAL_SEQ_STATE,
  shouldCatchUpCallSignals,
  type SignalSeqState,
} from './call-signal-catchup';
import { sendWithRetry } from './call-signal-retry';
import { SignalSendQueue } from './call-signal-send-queue';
import { shouldRestartIceOnNetworkChange } from './ice-restart-policy';
import {
  buildMediaSignal,
  DEFAULT_REMOTE_MEDIA,
  readMediaSignal,
  reconnectRestored,
  shouldAnnounceMedia,
} from './media-state-signal';
import { shouldSendVideo } from './video-track-state';
import { videoEncodingFor } from './video-encoding';
import {
  clearNativeCall,
  consumeLaunchCall,
  getCallConflictState,
  reconcileNativeConnections,
  placeOutgoingCall,
  showIncomingCallFromStream,
  startOngoingCall,
  subscribeToNativeCallEvents,
  subscribeToNetworkTransportChanges,
  subscribeToPipModeChanges,
} from './native-call-bridge';
import { navigatedCallIdAfterPhase, nextNavigatedCallId, shouldAutoNavigateToCallScreen } from './call-screen-return';
import { PendingCallAnswer } from './pending-call-answer';
import { startRingtone } from './ringtone';
import { shouldEndCallOnSessionChange } from './session-call-guard';
import { CallSession } from './webrtc-session';
import type { LaunchCall, NetworkTransport } from '../../../modules/vedamatch-calls';

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
 *
 * `ChatCallsApi`, `ChatCallsContext` и `useChatCalls` — в `chat-calls-
 * context.ts`, не здесь: этот файл тянет WebRTC-сессию, `expo-audio` и
 * `react-native-incall-manager`, а хук нужен местам, которым весь этот вес
 * ни к чему (кнопка звонка в шапке чата, баннеры, экран звонка) — импорт
 * оттуда не тянет за собой ничего из этого файла.
 */

/** Сколько экран «звонок завершён» висит сам, прежде чем уйти. */
const ENDED_AUTOCLOSE_MS = 3000;
/** Ошибка старта (занято, нет микрофона) показывается недолго и сама уходит. */
const ERROR_AUTOCLEAR_MS = 5000;
/** Как часто перечитывать статистику relay во время разговора. */
const RELAY_POLL_MS = 5000;

export function CallProvider({ children }: { children: ReactNode }) {
  const { status, api, user, registerBeforeSignOut } = useSession();
  const stream = useChatStream();
  const callsApi = useMemo(() => createChatCallsApi(api), [api]);
  const userId = user?.id ?? '';

  const [state, dispatch] = useReducer(reduceCall, IDLE_STATE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [relayed, setRelayed] = useState<boolean | null>(null);
  const [screenVisible, setScreenVisible] = useState(false);
  /** Камера собеседника (VED-291). Молчание = включена, см. `media-state-signal.ts`. */
  const [remoteVideoOn, setRemoteVideoOn] = useState(DEFAULT_REMOTE_MEDIA.video);
  /** Открыто ли окно «картинка в картинке» — от него зависит, гасить ли
   *  камеру при уходе приложения в фон (`video-track-state.ts`). */
  const [pipActive, setPipActive] = useState(false);
  /** `AppState`, приведённый к трём значениям `shouldSendVideo`. */
  const [appState, setAppState] = useState<'active' | 'background' | 'inactive'>(() =>
    AppState.currentState === 'background' || AppState.currentState === 'inactive'
      ? AppState.currentState
      : 'active',
  );
  /** Что мы последний раз сообщили собеседнику о своей камере; `null` —
   *  «в этом соединении ещё ничего», в том числе сразу после `connected`. */
  const announcedVideo = useRef<boolean | null>(null);

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
  /** Наибольший применённый `seq` сигнала этого звонка (VED-261) — общий
   *  для потока и для дочитывания через `chat-calls-client.ts#signals`. */
  const signalSeqRef = useRef<SignalSeqState>(INITIAL_SIGNAL_SEQ_STATE);
  /** Сериализация отправки (VED-261, feedback-002): следующий сигнал
   *  уходит на сервер только после того, как предыдущий полностью
   *  разрешился — иначе параллельные ретраи могут доставить их не в том
   *  порядке, в котором они были сгенерированы. */
  const sendQueueRef = useRef(new SignalSendQueue());
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
    signalSeqRef.current = INITIAL_SIGNAL_SEQ_STATE;
    sendQueueRef.current = new SignalSendQueue();
    setLocalStream(null);
    setRemoteStream(null);
    setRelayed(null);
    // VED-291: новое соединение — заново «камера собеседника включена» и
    // «мы ещё ничего о своей не сообщали». Иначе заглушка от прошлого
    // звонка встретила бы следующий.
    setRemoteVideoOn(DEFAULT_REMOTE_MEDIA.video);
    announcedVideo.current = null;
  }, []);

  const iceServers = useCallback(async (): Promise<ChatIceServerDto[]> => {
    // Учётка TURN живёт десять минут: перед каждым звонком запрашиваем
    // свежую, а не держим одну на сессию.
    const res = await callsApi.iceServers();
    iceRef.current = res.iceServers;
    if (res.iceServers.length === 0) {
      // eslint-disable-next-line no-console -- диагностика живой проверки
      // BUG A (VED-222): пустой список сразу объясняет «не соединился», не
      // заставляя гадать по ICE-логам ниже.
      console.warn('[calls] iceServers: сервер вернул пустой список — STUN/TURN недоступны для этого звонка');
    }
    return res.iceServers;
  }, [callsApi]);

  const finishLocally = useCallback((status: ChatCallStatus, error?: string | null) => {
    dispatch({ type: 'local-ended', status, error });
  }, []);

  /** Сообщить серверу о конце и закрыть медиа. Идемпотентно. */
  const hangUpWith = useCallback(
    async (reason: 'hangup' | 'network', errorMessage?: string) => {
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
      finishLocally(localStatus, errorMessage);
      closeSession();
      // eslint-disable-next-line no-console -- диагностика для живого теста
      // (`gan-harness`-задание: «decline с причиной» — видно в logcat релиза
      // как `W ReactNativeJS`).
      console.warn('[calls] hangUpWith', { callId: call.id, phase: current.phase, reason, localStatus });
      try {
        if (current.phase === 'incoming') await callsApi.decline(call.id);
        else await callsApi.end(call.id, { reason, relayed: wasRelayed });
      } catch {
        // Сервер сам добьёт звонок таймером или по сигналу второй стороны.
      }
    },
    [callsApi, closeSession, finishLocally],
  );

  /**
   * Отправка сигнала второй стороне. Общая точка и для переговоров
   * (offer/answer/ICE из `CallSession`), и для состояния камеры (VED-291):
   * очередь и идемпотентный ключ должны быть одни и те же, иначе сигнал о
   * камере мог бы обогнать `answer`.
   */
  const sendSignal = useCallback(
    (signal: ChatCallSignal) => {
      const id = stateRef.current.call?.id;
      if (!id) return;
      // Один ключ на сигнал, не на попытку (VED-261, feedback-002,
      // блокирующий п.1): partial-success ретрай («сервер сохранил,
      // ответ потерялся») с тем же clientSignalId — идемпотентный
      // no-op на сервере, а не второй offer/answer с новым seq.
      const clientSignalId = randomUUID();
      // Очередь — следующий сигнал этой сессии стартует только после
      // того, как этот полностью разрешится, иначе параллельные
      // ретраи могут обогнать друг друга по порядку доставки.
      void sendQueueRef.current.enqueue(() =>
        // VED-261: сервер отвечает 503, если сигнал не удалось надёжно
        // сохранить (временный сбой Redis) — это явная просьба
        // повторить, а не молчаливая потеря.
        sendWithRetry(() => callsApi.signal(id, signal, clientSignalId)),
      );
    },
    [callsApi],
  );

  const createSession = useCallback(
    (role: 'caller' | 'callee', servers: ChatIceServerDto[]) => {
      closeSession();
      const session = new CallSession(servers, role, {
        onSignal: sendSignal,
        onRemoteStream: (remote) => setRemoteStream(remote),
        onConnected: () => dispatch({ type: 'connected', at: Date.now() }),
        onDisconnected: () => dispatch({ type: 'disconnected' }),
        onFailed: () => void hangUpWith('network'),
      });
      sessionRef.current = session;
      return session;
    },
    [closeSession, hangUpWith, sendSignal],
  );

  const drainQueuedSignals = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    for (const signal of queuedSignals.current.splice(0))
      await session.handleSignal(signal).catch(logHandleSignalError);
  }, []);

  /**
   * Единственная точка применения сигнала — что бы его ни принесло: сам
   * поток или дочитывание после обрыва/пересинхронизации (VED-261).
   * `admitCallSignal` решает по общему `signalSeqRef`, применять ли его ещё
   * раз, поэтому неважно, в каком порядке подоспеют оба источника —
   * переприменения не будет.
   */
  const applySignal = useCallback(async (seq: number | undefined, signal: ChatCallSignal) => {
    const { admit, next } = admitCallSignal(signalSeqRef.current, seq);
    if (!admit) return;
    signalSeqRef.current = next;
    // Состояние камеры собеседника (VED-291) — это про экран, не про
    // переговоры: применяем сразу и НЕ откладываем в `queuedSignals`, даже
    // если сессия ещё не поднята. Отложенный сигнал о камере применился бы
    // позже offer/answer и на мгновение показал бы не то.
    const media = readMediaSignal(signal);
    if (media) {
      setRemoteVideoOn(media.video);
      return;
    }
    const session = sessionRef.current;
    if (session) await session.handleSignal(signal).catch(logHandleSignalError);
    else queuedSignals.current.push(signal);
  }, []);

  /**
   * Запрос и применение — без проверки фазы: используется и там, где фаза
   * заведомо верная (сразу после успешного `accept()`, до того как React
   * перерисовал `stateRef`), и там, где её стоит перепроверить
   * (`catchUpSignals` ниже). Сеть — не повод падать: следующая попытка
   * (пересинхронизация потока или таймаут `connecting`) повторит сама.
   */
  const fetchAndApplySignals = useCallback(
    async (callId: string) => {
      try {
        const { signals } = await callsApi.signals(callId, signalSeqRef.current.lastSeq);
        for (const item of signals) await applySignal(item.seq, item.signal);
      } catch {
        // Следующая попытка (ресинк/таймаут) повторит.
      }
    },
    [applySignal, callsApi],
  );

  /**
   * То же самое, но только в фазах «соединяемся»/«разговор» — для
   * пересинхронизации потока (`stream.onResync`) и таймаута `connecting`,
   * где звонка в состоянии может уже не быть вовсе или он мог завершиться.
   */
  const catchUpSignals = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || !shouldCatchUpCallSignals(stateRef.current.phase)) return;
    await fetchAndApplySignals(call.id);
  }, [fetchAndApplySignals]);

  // ---------- общий поток событий ----------

  useEffect(() => {
    if (status !== 'signed') return;
    return stream.subscribe((event) => {
      if (!isCallEvent(event)) return;
      if (event.type === 'call.signal') {
        if (event.callId !== stateRef.current.call?.id) return;
        void applySignal(event.seq, event.signal);
        return;
      }
      // BUG D (VED-222, живая проверка): настоящий чужой входящий, узнанный
      // по SSE, пока приложение не на переднем плане (заблокировано/в фоне)
      // — нативный путь (`Connection` + полноэкранный intent) вместо
      // JS-баннера/рингтона, которых за блокировкой никто не видел и не
      // слышал (`decideIncomingCallPresentation`,
      // `incoming-call-presentation.ts`); только Android — на iOS нет
      // альтернативы нативному пути вовсе, там `dispatch` идёт как раньше.
      // Только из простоя (не мешаем уже идущему разговору) — дедуп по
      // `callId` внутри `showIncomingCallFromStream` (`callLifecycleTracker`,
      // общий с пуш-путём) защищает от повторного вызова на каждый ре-рендер
      // потока.
      if (
        Platform.OS === 'android' &&
        event.type === 'call.ringing' &&
        stateRef.current.phase === 'idle' &&
        event.call.callee.id === userId &&
        AppState.currentState !== 'active'
      ) {
        void showIncomingCallFromStream({
          callId: event.call.id,
          callerName: event.call.caller.name,
          kind: event.call.kind,
          avatarUrl: event.call.caller.avatarUrl,
        });
        return;
      }
      // Финал звонка, которого провайдер не ведёт (например, поднятого
      // нативно из фона, пока JS был в простое): погасить его соединение
      // здесь же — пуш `call.ended` мог не дойти (прод-баг 2026-09-19).
      // `endCall` идемпотентен, лишний вызов безвреден.
      if (event.type === 'call.ended' && event.call.id !== stateRef.current.call?.id)
        void clearNativeCall(event.call.id, nativeEndReason('ended', event.call.status));
      dispatch({ type: 'stream', event, selfId: userId });
      // Финал с сервера: медиа закрываем сразу, не дожидаясь перерисовки.
      if (event.type === 'call.ended' && event.call.id === stateRef.current.call?.id)
        closeSession();
    });
  }, [status, stream, userId, closeSession, applySignal]);

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
      const requestStartedAt = Date.now();
      const { call: activeCall } = await callsApi.active();
      // Прод-баг 2026-09-19: соединение Telecom, о котором сервер не знает,
      // звонило вечно и держало «занято» — сверяем и нативную сторону, не
      // только JS-состояние. Свой текущий звонок не трогаем: он мог
      // начаться, пока шёл запрос.
      const local = stateRef.current;
      reconcileNativeConnections(
        activeCall?.id ?? null,
        local.phase !== 'idle' && local.phase !== 'ended' ? (local.call?.id ?? null) : null,
        Date.now() - requestStartedAt,
      );
      if (activeCall) {
        const current = stateRef.current;
        // Из простоя — как раньше. Поверх «карточки предпросмотра»
        // (`callIsPreview`, BUG B этапа VED-222) — тоже можно: сервер
        // подтверждает те же данные точнее, ничего не теряется. Только
        // пока фаза ещё `incoming` — стоит человек уже нажал «Ответить»
        // (фаза ушла в `connecting`), затирать состояние снимком, где
        // сервер мог ещё не увидеть наш `accept()` (status всё ещё
        // `ringing`), нельзя — вернуло бы входящий баннер поверх идущего
        // соединения и создало риск повторного accept().
        if (current.phase === 'idle' || (current.phase === 'incoming' && current.callIsPreview))
          dispatch({ type: 'restore', call: activeCall, selfId: userId });
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
    return stream.onResync(() => {
      void reconcile();
      // VED-261: поток был закрыт (фон/обрыв) — `call.signal`, посланный в
      // это время, мог уйти в пустоту, если мы как раз ждали offer/answer.
      void catchUpSignals();
    });
  }, [status, stream, reconcile, catchUpSignals]);

  // ---------- реакции на смену фазы ----------

  const role = roleIn(state, userId);

  // Гудки: входящему и исходящему, пока не ответили. Входящему — только на
  // переднем плане (VED-222, живая проверка BUG D): за экраном блокировки
  // свой рингтон никто не слышит как настоящий звонок, только держит
  // wake lock (лог — ExoPlayer 44 с) и не мешает звонку уйти в пропущенные,
  // пока телефон должен звонить нативно (`decideIncomingCallPresentation`,
  // `incoming-call-presentation.ts`, `showInAppUi`/`playInAppRingtone`).
  // Исходящему гудок не трогаем — это наш собственный звонок, слышать его
  // в фоне ожидаемо (как обычный звонок из системной звонилки).
  useEffect(() => {
    const shouldRing =
      state.phase === 'outgoing' || (state.phase === 'incoming' && AppState.currentState === 'active');
    if (shouldRing) {
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
        dispatch({ type: 'failed', error: describeMediaError(error, Platform.OS) });
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
        dispatch({ type: 'failed', error: describeMediaError(error, Platform.OS) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, role]);

  /**
   * Застряли в «соединяемся» дольше 20 секунд (VED-261) — факт с
   * устройства: телефон нажал «Ответить», сервер подтвердил, а offer от
   * сайта так и не пришёл (поток был закрыт в момент рассылки), и звонок
   * висел в «Соединение…» больше двух минут без единого предупреждения.
   * `arm` — рекурсивный таймер (обычная вложенная функция, не хук, — та же
   * форма, что на сайте, `apps/web/.../call-provider.tsx`): по срабатыванию
   * сперва пробует дочитать сигналы (`catchUpSignals`), и если это принесло
   * что-то новое, даёт ещё одно окно (`decideConnectingTimeout` → `extend`)
   * — иначе решает, что звонок действительно потерян, и вешает трубку с
   * понятной причиной вместо бесконечного «Соединение…».
   */
  const connectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (connectingTimerRef.current) {
      clearTimeout(connectingTimerRef.current);
      connectingTimerRef.current = null;
    }
    if (state.phase !== 'connecting' || !state.call) return;
    const callId = state.call.id;

    const arm = (alreadyExtended: boolean) => {
      connectingTimerRef.current = setTimeout(() => {
        void (async () => {
          const before = signalSeqRef.current.lastSeq;
          await catchUpSignals();
          const decision = decideConnectingTimeout({
            phase: stateRef.current.phase,
            timeoutCallId: callId,
            currentCallId: stateRef.current.call?.id ?? null,
            madeProgress: signalSeqRef.current.lastSeq > before,
            alreadyExtended,
          });
          if (decision === 'ignore') return;
          if (decision === 'extend') {
            arm(true);
            return;
          }
          void hangUpWith('network', 'Не удалось соединиться — проверьте интернет');
        })();
      }, CONNECTING_TIMEOUT_MS);
    };
    arm(false);

    return () => {
      if (connectingTimerRef.current) {
        clearTimeout(connectingTimerRef.current);
        connectingTimerRef.current = null;
      }
    };
  }, [state.phase, state.call, catchUpSignals, hangUpWith]);

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
  //
  // Входящий (ещё не отвеченный), пока НА ПЕРЕДНЕМ ПЛАНЕ шёл JS-баннер, а
  // человек в момент звонка свернул/заблокировал телефон, — раньше decline
  // безусловно. С self-managed `Connection` (Android) это больше не
  // единственный выход: баннер станет не виден, но нативный путь способен
  // показать входящий поверх блокировки (VED-222, живая проверка BUG D) —
  // поднимаем его тем же `showIncomingCallFromStream`, что и обнаружение по
  // SSE в фоне выше (дедуп по `callId` не даст поднять второй раз, если
  // нативный уже как-то шёл).
  //
  // Веб (веха 5) — НЕ decline: `AppState` на вебе отражает
  // `document.visibilitychange` (`react-native-web`), а не «телефон
  // заблокирован» — переключение вкладки браузера, обычное и частое
  // действие, не должно сбрасывать ещё не отвеченный звонок под
  // собеседником. Решение вынесено в `decideBackgroundIncomingAction`
  // (`call-app-background-policy.ts`, +spec) — раньше здесь была ветка «не
  // Android — значит iOS, значит decline», которая на практике (в этом
  // продукте нет нативной iOS-сборки, только веб, см. `PLAN.md`) всегда
  // означала именно веб.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'background') return;
      const current = stateRef.current;
      if (!current.call || current.phase === 'idle' || current.phase === 'ended') return;
      if (current.phase !== 'incoming') return;
      const action = decideBackgroundIncomingAction(Platform.OS);
      if (action === 'ignore') return;
      if (action === 'native') {
        const from = companionOf(current.call, userId);
        void showIncomingCallFromStream({
          callId: current.call.id,
          callerName: from.name,
          kind: current.call.kind,
          avatarUrl: from.avatarUrl,
        });
        return;
      }
      void callsApi.decline(current.call.id).catch(() => undefined);
    });
    return () => sub.remove();
  }, [callsApi, userId]);

  // Синхронизация выключателей с дорожками.
  useEffect(() => {
    sessionRef.current?.setMuted(state.muted);
  }, [state.muted, localStream]);
  // ---------- видео (VED-291) ----------

  // `AppState` и «картинка в картинке» нужны здесь, а не только на экране
  // звонка: экран умеет сворачиваться по «назад», не завершая разговор
  // (`call-screen-return.ts`), а камеру гасить надо в любом случае.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) =>
      setAppState(next === 'background' || next === 'inactive' ? next : 'active'),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => subscribeToPipModeChanges(setPipActive), []);

  /**
   * Единственное место, где решается судьба исходящей картинки: кнопка
   * «камера», уход приложения в фон (батарея — `video-track-state.ts`) и
   * фаза звонка сходятся в один флаг, он же дословно уходит собеседнику
   * (`media-state-signal.ts`), чтобы тот видел заглушку с аватаром, а не
   * замёрзший кадр.
   *
   * `localStream` в зависимостях — чтобы применить состояние к дорожкам,
   * как только они появились (сессия создаётся раньше, чем `getUserMedia`
   * успевает вернуть поток).
   */
  const sendingVideo = shouldSendVideo({
    kind: state.call?.kind ?? 'audio',
    phase: state.phase,
    cameraOff: state.cameraOff,
    appState,
    pipActive,
  });
  const wasReconnecting = useRef(false);
  useEffect(() => {
    const session = sessionRef.current;
    // Связь вернулась после обрыва/перезапуска ICE — наш прошлый сигнал мог
    // не доехать, забываем отметку и сообщаем состояние заново.
    if (reconnectRestored(wasReconnecting.current, state.reconnecting))
      announcedVideo.current = null;
    wasReconnecting.current = state.reconnecting;
    if (!session) return;
    session.setCameraOff(!sendingVideo);
    if (!session.hasVideoTrack()) return;
    if (!shouldAnnounceMedia(announcedVideo.current, sendingVideo)) return;
    announcedVideo.current = sendingVideo;
    sendSignal(buildMediaSignal(sendingVideo));
  }, [sendingVideo, localStream, sendSignal, state.reconnecting]);

  /**
   * Потолок качества исходящего видео под текущую сеть (`video-encoding.ts`).
   * Пересчитывается на каждую смену транспорта (Wi-Fi ↔ LTE — отслеживается
   * ниже тем же подписчиком, что и перезапуск ICE) и на выход из
   * переподключения: после ICE restart отправитель пересобирается, и
   * прежние `encodings` могли не пережить это.
   */
  const videoTransport = useRef<NetworkTransport | null>(null);
  const applyVideoEncoding = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !session.hasVideoTrack()) return;
    void session.applyVideoEncoding(videoEncodingFor(videoTransport.current));
  }, []);
  useEffect(() => {
    if (state.phase !== 'active' || state.reconnecting) return;
    applyVideoEncoding();
  }, [state.phase, state.reconnecting, localStream, applyVideoEncoding]);

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
          error: error instanceof ApiError ? error.message : describeMediaError(error, Platform.OS),
        });
      }
    },
    [callsApi, closeSession, createSession, iceServers],
  );

  /**
   * Правка по факту живой проверки (Samsung Galaxy A51, VED-222): без этой
   * метки `accept()` не защищён от повторного вызова для ОДНОГО И ТОГО ЖЕ
   * звонка — двух источников «Ответить» (`onAnswer`-эффект и
   * `pendingAnswer.consume()`-эффект ниже) с разными условиями срабатывания.
   * Оба они и раньше не должны были совпасть на одном и том же рендере
   * (взаимоисключающие ветки/идемпотентный `consume()`), живая проверка не
   * подтвердила двойной вызов ИМЕННО отсюда — настоящая причина найденного
   * decline'а оказалась в `callConflictState` (`excludeCallId`, выше по
   * файлу) — но guard добавлен как дешёвая защита от того же класса гонки
   * на будущее, раз код уже разбирался специально под эту живую проверку.
   */
  const acceptingCallId = useRef<string | null>(null);

  const accept = useCallback(async () => {
    const call = stateRef.current.call;
    if (!call || stateRef.current.phase !== 'incoming') return;
    if (acceptingCallId.current === call.id) {
      // eslint-disable-next-line no-console
      console.warn('[calls] accept: уже отвечаем на этот звонок, повторный вызов пропущен', { callId: call.id });
      return;
    }
    acceptingCallId.current = call.id;
    answerAttemptCallId.current = call.id;
    // eslint-disable-next-line no-console
    console.warn('[calls] accept: начат', { callId: call.id });
    try {
      const servers = await iceServers();
      const session = createSession('callee', servers);
      setLocalStream(await session.startLocalMedia(call.kind));
      dispatch({ type: 'accepting' });
      await callsApi.accept(call.id);
      // eslint-disable-next-line no-console
      console.warn('[calls] accept: сервер подтвердил', { callId: call.id });
      // VED-261: факт с устройства — пока телефон принимал звонок, сервер
      // уже мог разослать offer тому, чей поток `chat-stream.tsx` в этот
      // момент не слушал (медленная сеть, поток ещё поднимается). Дочитать
      // явно, не дожидаясь пересинхронизации потока (`stateRef.current.phase`
      // тут ещё может не быть «connecting» — React не перерисовал, поэтому
      // идём в обход фазовой проверки `catchUpSignals`, а не через неё).
      await fetchAndApplySignals(call.id);
      await drainQueuedSignals();
    } catch (error) {
      closeSession();
      const message = error instanceof ApiError ? error.message : describeMediaError(error, Platform.OS);
      // eslint-disable-next-line no-console
      console.warn('[calls] accept: отказ, отправляю decline', { callId: call.id, reason: message });
      // Микрофон/камеру не дали — звонок для нас кончился, а собеседнику скажем.
      finishLocally('declined', message);
      void callsApi.decline(call.id).catch(() => undefined);
    } finally {
      if (acceptingCallId.current === call.id) acceptingCallId.current = null;
    }
  }, [
    callsApi,
    closeSession,
    createSession,
    drainQueuedSignals,
    fetchAndApplySignals,
    finishLocally,
    iceServers,
  ]);

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

  /**
   * Выход из аккаунта во время разговора (`gan-harness/feedback/feedback-002.md`,
   * блокирующий п.1) — `CallProvider` смонтирован выше `Stack.Protected`
   * (`_layout.tsx`) и НЕ размонтируется при потере сессии, поэтому единственный
   * способ закончить звонок сам, не дожидаясь, пока человек полезет в шторку
   * уведомлений, — явно завершить его здесь. Локальная уборка (WebRTC, аудиосессия,
   * foreground-служба, self-managed `Connection`) не требует отдельного кода:
   * `hangUpWith('hangup')` синхронно переводит `phase` в `ended` ДО сетевого
   * запроса (`finishLocally`+`closeSession()`), а все существующие эффекты
   * (`audioSessionLive`, `nativeClearedFor`) уже следят именно за `phase`, не
   * за `status` — они сработают сами. Рингтон (эффект на `state.phase`) гасится
   * тем же переходом. `pendingAnswer.clear()` — отдельно, он не завязан на
   * `phase` вовсе.
   */
  const endCallForLogout = useCallback(async () => {
    pendingAnswer.clear();
    await hangUpWith('hangup');
  }, [hangUpWith, pendingAnswer]);

  // Путь 1: явный `signOut()` — `session.tsx` дожидается этого колбэка (best-effort,
  // с общим таймаутом ~2 с) ДО отзыва токенов, чтобы POST /chat/calls/:id/end
  // ушёл с ещё живым access-токеном, а не после того, как `status` уже стал
  // `'guest'` и токена не осталось.
  useEffect(() => {
    return registerBeforeSignOut(endCallForLogout);
  }, [registerBeforeSignOut, endCallForLogout]);

  // Путь 2: общий предохранитель на ЛЮБУЮ потерю сессии, не только через
  // `signOut()` (например, `onSessionExpired` в `client.ts` зовёт `dropSession()`
  // напрямую при 401) — токены к этому моменту уже могут быть стёрты
  // (`dropSession()` роняет их раньше, чем `status` меняется), сетевой запрос
  // тогда просто не пройдёт (уже проглатывается `try/catch` в `hangUpWith`),
  // но ЛОКАЛЬНАЯ уборка (микрофон/камера, служба, `Connection`) случится в
  // любом случае — это и есть главный приватностный риск, который решает
  // этот путь. Чистое решение «нужно ли завершать» — `shouldEndCallOnSessionChange`
  // (`session-call-guard.ts`, +spec), а не голая проверка `status` тут же.
  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (shouldEndCallOnSessionChange(previous, status, stateRef.current.phase)) void endCallForLogout();
  }, [status, endCallForLogout]);

  // `action === 'open'`: `fullScreenIntent` поднял Activity для ещё не
  // отвеченного звонка (BUG B, живая проверка VED-222) — читаем один раз при
  // монтировании (`getLaunchCall()` одноразовый), но карточку строим только
  // когда известен `userId` (`callee.id` в `buildLaunchPreviewCall` — без
  // него `roleIn()` не узнал бы нас в собственном звонке): на холодном
  // старте `CallProvider` может смонтироваться на кадр раньше, чем сессия
  // дочитается из хранилища.
  const pendingOpenLaunch = useRef<LaunchCall | null>(null);
  useEffect(() => {
    const launch = consumeLaunchCall();
    if (!launch) return;
    if (launch.action === 'answer') {
      pendingAnswer.request(launch.callId);
      return;
    }
    pendingOpenLaunch.current = launch;
  }, [pendingAnswer]);
  useEffect(() => {
    const launch = pendingOpenLaunch.current;
    if (!launch || !userId) return;
    pendingOpenLaunch.current = null;
    // `reconcile()` всё равно уходит на `/chat/calls/active` на этом же
    // монтировании и подтвердит/поправит карточку точнее (`callIsPreview` в
    // `call-machine.ts`) — здесь только немедленный первый кадр. Перебить
    // уже идущее сама `reduceCall` не даст (только из простоя).
    const preview = buildLaunchPreviewCall(launch, userId);
    if (preview) dispatch({ type: 'preview', call: preview });
  }, [userId]);
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
        // eslint-disable-next-line no-console -- диагностика для живого теста.
        console.warn('[calls] native onAnswer получен', { callId, phase: current.phase, knownCallId: current.call?.id });
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
  // Поправка комментария по факту (`gan-harness/feedback/feedback-002.md`,
  // блокирующий п.1): `CallProvider` смонтирован в `_layout.tsx` ВЫШЕ
  // `Stack.Protected` и в реальном дереве приложения НЕ размонтируется
  // никогда, в т.ч. при логауте — этот cleanup поэтому недостижим на
  // практике прямо сейчас, а не страховка «на случай logout», как было
  // написано раньше (тот сценарий закрывает не unmount, а отдельный эффект
  // на `status`, см. `endCallForLogout`/`session-call-guard.ts` выше).
  // Оставлен как корректный defensive cleanup на случай, если у `RootLayout`
  // когда-нибудь появится условный размонт `CallProvider`, а не убран как
  // мёртвый код — он не создаёт риска (просто никогда не выполняется), а
  // без него провайдер тихо предполагал бы, что размонтирования не бывает
  // вовсе.
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
      // VED-291: потолок видео — по текущему транспорту. В отличие от
      // перезапуска ICE, это делают обе стороны и на любой фазе: ушли с
      // Wi-Fi в сотовую — сузились, вернулись — расширились обратно.
      videoTransport.current = transport;
      applyVideoEncoding();
      const now = Date.now();
      if (
        shouldRestartIceOnNetworkChange(stateRef.current.phase, role ?? 'callee', previous, transport, now, lastIceRestartAt.current)
      ) {
        lastIceRestartAt.current = now;
        void sessionRef.current?.restartIce();
      }
    });
  }, [role, applyVideoEncoding]);

  const apiValue = useMemo<ChatCallsApi>(
    () => ({
      state,
      selfId: userId,
      localStream,
      remoteStream,
      relayed,
      remoteVideoOn,
      sendingVideo,
      pipActive,
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
      remoteVideoOn,
      sendingVideo,
      pipActive,
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
      {/* VED-222 (feedback-002.md, блокирующий п.1): баннеры — только для
          вошедшего. Без этого `ReturnToCallBanner` мог бы на мгновение
          нарисоваться поверх экрана входа (гость, `Stack.Protected` уже не
          знает маршрут `/call/[id]`, на который она ведёт) — состояние
          звонка к этому моменту уже сброшено эффектом на `status` выше, но
          гейт рендера здесь — независимая, более простая для чтения защита
          от той же ситуации, а не дубль той же логики другим способом. */}
      {status === 'signed' ? (
        <>
          <IncomingCallBanner />
          <ReturnToCallBanner />
          <CallErrorToast />
        </>
      ) : null}
    </ChatCallsContext.Provider>
  );
}

function isCallEvent(event: ChatStreamEvent): event is ChatCallStreamEvent {
  return event.type.startsWith('call.');
}

/**
 * `CallSession.handleSignal` отклоняется по двум причинам: настоящая сетевая
 * ошибка и защитный `console.warn`-guard внутри `webrtc-session.ts` (дубль/
 * поздний ответ второй стороны — VED-261, feedback-002). Раньше оба случая
 * молча проглатывались (`.catch(() => undefined)`) — деградацию было не
 * отличить от нормальной работы, кроме как по факту багрепорта. Звонок это
 * не ломает, поэтому не пробрасываем ошибку дальше — только делаем видимой.
 */
function logHandleSignalError(error: unknown): void {
  // eslint-disable-next-line no-console -- та же диагностика, что у
  // остального сигналинга в этом провайдере (`console.warn('[calls] ...')`).
  console.warn('[calls] handleSignal завершился с ошибкой', error);
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
