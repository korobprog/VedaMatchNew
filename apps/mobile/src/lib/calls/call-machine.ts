import type {
  ChatCallDto,
  ChatCallStatus,
  ChatCallStreamEvent,
} from '@vedamatch/shared';

/**
 * Машина состояний звонка — перенос без переписывания из
 * `apps/web/src/components/chat/calls/call-machine.ts`. Чистая: ни WebRTC,
 * ни сети — только «что показывать и что позволено», по событиям сервера
 * и действиям человека. `call-provider.tsx` скармливает ей события и
 * исполняет побочные эффекты по её решениям.
 *
 * Фазы:
 * - idle       — звонка нет;
 * - outgoing   — мы звоним, у собеседника гудок;
 * - incoming   — нам звонят, показываем баннер;
 * - connecting — обе стороны согласились, идёт обмен SDP/ICE;
 * - active     — медиа течёт;
 * - ended      — финал показан, ждём сброса.
 */
export type CallPhase =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'active'
  | 'ended';

export interface CallState {
  phase: CallPhase;
  call: ChatCallDto | null;
  /**
   * `call` собран на телефоне из данных `PendingCallStore` (имя/аватар/вид),
   * не с сервера (VED-222, живая проверка: экран, поднятый `fullScreenIntent`,
   * должен показать входящий немедленно, не дожидаясь `reconcile()`/SSE —
   * `call-provider.tsx#buildPreviewCall`). Отличает «временную карточку» от
   * настоящей: пока флаг взведён и фаза всё ещё `incoming`, `reconcile()`
   * вправе перезаписать `call` результатом `/chat/calls/active` (обычно —
   * идемпотентно, тот же `id`); как только фаза уходит дальше (`accepting`
   * и т.д.), реконсайл такую подмену больше не делает — см. guard в
   * `call-provider.tsx`.
   */
  callIsPreview: boolean;
  /** Чем кончилось — для экрана «звонок завершён». */
  endedStatus: ChatCallStatus | null;
  /** Когда пошёл разговор (ms), для таймера на экране. */
  connectedAt: number | null;
  /** Связь потерялась, ICE пытается восстановиться. */
  reconnecting: boolean;
  muted: boolean;
  cameraOff: boolean;
  error: string | null;
  /**
   * Вызов начат именно на этом устройстве (VED-346). События звонка
   * рассылаются на все устройства человека, вошедшего с нескольких:
   * `call.ringing` о собственном исходящем приходит и во вкладку сайта, и
   * на второй телефон, откуда никто никуда не звонил. Флаг взводится в
   * момент нажатия «позвонить» — ещё до ответа POST, потому что событие
   * потока умеет его обогнать, — и отличает «наш гудок» от «гудка на
   * соседнем устройстве».
   */
  startedHere: boolean;
  /**
   * На «Принять» нажали именно здесь (VED-358). Зеркало `startedHere` для
   * входящего: `call.accepted` о звонке, на который мы всё ещё показываем
   * «Принять», по умолчанию читается как «ответили на другом устройстве» и
   * убирает входящий (VED-346) — но ровно то же событие приходит и
   * отвечающему устройству, пока оно не успело перейти в `connecting`.
   * Между нажатием и `accepting` лежат два ожидания — список ICE-серверов
   * по сети и `getUserMedia` с системным запросом доступа к камере, — и
   * всё это время фаза здесь ещё `incoming`. Метка ставится синхронно в
   * момент нажатия и говорит: этот `call.accepted` про нас, звонок не
   * гасить.
   */
  answeringHere: boolean;
}

export const IDLE_STATE: CallState = {
  phase: 'idle',
  call: null,
  callIsPreview: false,
  startedHere: false,
  answeringHere: false,
  endedStatus: null,
  connectedAt: null,
  reconnecting: false,
  muted: false,
  cameraOff: false,
  error: null,
};

export type CallAction =
  /** Человек нажал «позвонить» — микрофон ещё спрашиваем, POST не ушёл. */
  | { type: 'outgoing-starting' }
  /** POST /chat/calls вернул звонок — гудки пошли. */
  | { type: 'outgoing-started'; call: ChatCallDto }
  /** Событие из общего потока. `selfId` — кто мы, чтобы понять роль. */
  | { type: 'stream'; event: ChatCallStreamEvent; selfId: string }
  /** Восстановление после перезапуска: сервер сказал, в каком мы звонке. */
  | { type: 'restore'; call: ChatCallDto; selfId: string }
  /**
   * `fullScreenIntent` поднял `Activity` для ещё не отвеченного звонка —
   * показать входящий немедленно данными из `PendingCallStore`, не дожидаясь
   * `reconcile()` (VED-222, живая проверка BUG B). Только из простоя: если
   * что-то уже происходит (свой исходящий, другой входящий по SSE), карточка
   * из фонового запуска — не повод его перебивать.
   */
  | { type: 'preview'; call: ChatCallDto }
  /**
   * Человек нажал «Принять» — микрофон/камеру ещё спрашиваем, POST не ушёл
   * (VED-358). Отдельно от `accepting`: тот переводит фазу и потому уходит
   * уже после `getUserMedia`, а метка «отвечаем здесь» нужна синхронно с
   * нажатием — иначе `call.accepted`, прилетевший в эту дырку, погасил бы
   * звонок на отвечающем же устройстве.
   */
  | { type: 'answering' }
  /** Человек нажал «ответить» — сервер ещё не подтвердил. */
  | { type: 'accepting' }
  | { type: 'connected'; at: number }
  | { type: 'disconnected' }
  | { type: 'toggle-mute' }
  | { type: 'toggle-camera' }
  /** Локальный финал: мы положили трубку или что-то сломалось до ответа сервера. */
  | { type: 'local-ended'; status: ChatCallStatus; error?: string | null }
  | { type: 'failed'; error: string }
  | { type: 'reset' };

export function reduceCall(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case 'outgoing-starting':
      return state.phase === 'idle' ? { ...IDLE_STATE, startedHere: true } : state;

    case 'outgoing-started':
      return { ...IDLE_STATE, phase: 'outgoing', call: action.call, startedHere: true };

    case 'preview':
      return state.phase === 'idle'
        ? { ...IDLE_STATE, phase: 'incoming', call: action.call, callIsPreview: true }
        : state;

    case 'restore': {
      const role = action.call.caller.id === action.selfId ? 'caller' : 'callee';
      if (action.call.status === 'ringing')
        return {
          ...IDLE_STATE,
          phase: role === 'caller' ? 'outgoing' : 'incoming',
          call: action.call,
        };
      if (action.call.status === 'accepted')
        // Разговор шёл, приложение перезапустили: медиа надо поднимать заново,
        // и это состояние «соединяемся», а не «идёт».
        return { ...IDLE_STATE, phase: 'connecting', call: action.call };
      return state;
    }

    case 'stream':
      return reduceStream(state, action.event, action.selfId);

    case 'answering':
      return state.phase === 'incoming' ? { ...state, answeringHere: true } : state;

    case 'accepting':
      return state.phase === 'incoming'
        ? { ...state, phase: 'connecting', answeringHere: true }
        : state;

    case 'connected':
      return state.phase === 'connecting' || state.phase === 'active'
        ? {
            ...state,
            phase: 'active',
            reconnecting: false,
            connectedAt: state.connectedAt ?? action.at,
          }
        : state;

    case 'disconnected':
      return state.phase === 'active' ? { ...state, reconnecting: true } : state;

    case 'toggle-mute':
      return { ...state, muted: !state.muted };

    case 'toggle-camera':
      return { ...state, cameraOff: !state.cameraOff };

    case 'local-ended':
      if (state.phase === 'idle' || state.phase === 'ended') return state;
      return {
        ...state,
        phase: 'ended',
        endedStatus: action.status,
        reconnecting: false,
        error: action.error ?? null,
      };

    case 'failed':
      // Сорвалось до гудка (нет микрофона, «занято»): звонка отсюда больше
      // нет, и метку «звоним мы» надо снять — иначе следующее чужое
      // `call.ringing` о нашем исходящем с другого устройства подняло бы
      // экран здесь.
      if (state.phase === 'idle') return { ...state, startedHere: false, error: action.error };
      return {
        ...state,
        phase: 'ended',
        endedStatus: 'failed',
        reconnecting: false,
        error: action.error,
      };

    case 'reset':
      return IDLE_STATE;
  }
}

function reduceStream(
  state: CallState,
  event: ChatCallStreamEvent,
  selfId: string,
): CallState {
  if (event.type === 'call.signal') return state; // сигналинг — дело провайдера

  const sameCall = state.call?.id === event.call.id;

  switch (event.type) {
    case 'call.ringing':
      // Входящий показываем, только когда свободны. Второй звонок во время
      // первого сервер и так отвергнет как «занято»; здесь это защита от
      // гонки, когда события пришли раньше ответа на наш POST.
      if (state.phase !== 'idle' && state.phase !== 'ended') {
        // Наш собственный исходящий, пришедший событием раньше ответа POST.
        return sameCall ? { ...state, call: event.call } : state;
      }
      if (event.call.callee.id === selfId)
        return { ...IDLE_STATE, phase: 'incoming', call: event.call };
      // Свой же исходящий (VED-346). Экран вызова поднимаем только там, где
      // на «позвонить» нажимали: остальные устройства человека получают это
      // событие просто потому, что оно адресовано ему, — звонить самому себе
      // они не должны.
      if (event.call.caller.id === selfId && state.startedHere)
        return { ...IDLE_STATE, phase: 'outgoing', call: event.call, startedHere: true };
      return state;

    case 'call.accepted':
      if (!sameCall) return state;
      // Ответили на другом устройстве (VED-346): здесь мы всё ещё показываем
      // «Принять», а отвечать уже нечего — отвечающее устройство к этому
      // моменту само перешло в `connecting` (действие `accepting` уходит до
      // POST'а). Убираем входящий, а не подменяем его экраном звонка, в
      // котором нет ни медиа, ни сигналинга.
      //
      // VED-358: «к этому моменту само перешло в `connecting`» — неправда.
      // Между нажатием «Принять» и `accepting` лежат запрос ICE-серверов по
      // сети и `getUserMedia` (на первом видеозвонке — ещё и системный
      // вопрос о доступе к камере, который ждёт человека), а фаза всё это
      // время `incoming`. Отличаем «ответили там» от «отвечаем здесь» по
      // метке `answeringHere`, которую `accept()` ставит синхронно с
      // нажатием, а не по фазе.
      if (state.phase === 'incoming' && !state.answeringHere) return IDLE_STATE;
      if (state.phase === 'incoming')
        return { ...state, phase: 'connecting', call: event.call };
      return state.phase === 'outgoing'
        ? { ...state, phase: 'connecting', call: event.call }
        : { ...state, call: event.call };

    case 'call.ended':
      if (!sameCall) return state;
      if (state.phase === 'idle' || state.phase === 'ended')
        return { ...state, call: event.call, endedStatus: event.call.status };
      return {
        ...state,
        phase: 'ended',
        call: event.call,
        endedStatus: event.call.status,
        reconnecting: false,
      };
  }
}

/** Наша роль в текущем звонке. */
export function roleIn(state: CallState, selfId: string): 'caller' | 'callee' | null {
  if (!state.call) return null;
  if (state.call.caller.id === selfId) return 'caller';
  if (state.call.callee.id === selfId) return 'callee';
  return null;
}

/** Собеседник — тот из двух, кто не мы. */
export function companionOf(call: ChatCallDto, selfId: string) {
  return call.caller.id === selfId ? call.callee : call.caller;
}

/** Подпись финала на экране «звонок завершён». */
export function endedLabel(
  status: ChatCallStatus | null,
  role: 'caller' | 'callee' | null,
): string {
  switch (status) {
    case 'ended':
      return 'Звонок завершён';
    case 'failed':
      return 'Связь оборвалась';
    case 'missed':
      return role === 'caller' ? 'Не ответили' : 'Пропущенный звонок';
    case 'declined':
      return role === 'caller' ? 'Собеседник отклонил звонок' : 'Звонок отклонён';
    case 'cancelled':
      return role === 'caller' ? 'Звонок отменён' : 'Звонивший отменил вызов';
    default:
      return 'Звонок завершён';
  }
}
