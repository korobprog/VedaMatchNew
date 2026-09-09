import type {
  ChatCallDto,
  ChatCallStatus,
  ChatCallStreamEvent,
} from "@vedamatch/shared";

/**
 * Машина состояний звонка на клиенте. Чистая: ни WebRTC, ни сети — только
 * «что показывать и что позволено», по событиям сервера и действиям
 * человека. Хук `use-call` скармливает ей события и исполняет побочные
 * эффекты по её решениям.
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
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "active"
  | "ended";

export interface CallState {
  phase: CallPhase;
  call: ChatCallDto | null;
  /** Чем кончилось — для экрана «звонок завершён». */
  endedStatus: ChatCallStatus | null;
  /** Когда пошёл разговор (ms), для таймера на экране. */
  connectedAt: number | null;
  /** Связь потерялась, ICE пытается восстановиться. */
  reconnecting: boolean;
  muted: boolean;
  cameraOff: boolean;
  error: string | null;
}

export const IDLE_STATE: CallState = {
  phase: "idle",
  call: null,
  endedStatus: null,
  connectedAt: null,
  reconnecting: false,
  muted: false,
  cameraOff: false,
  error: null,
};

export type CallAction =
  /** POST /chat/calls вернул звонок — гудки пошли. */
  | { type: "outgoing-started"; call: ChatCallDto }
  /** Событие из общего потока. `selfId` — кто мы, чтобы понять роль. */
  | { type: "stream"; event: ChatCallStreamEvent; selfId: string }
  /** Восстановление после перезагрузки: сервер сказал, в каком мы звонке. */
  | { type: "restore"; call: ChatCallDto; selfId: string }
  /** Человек нажал «ответить» — сервер ещё не подтвердил. */
  | { type: "accepting" }
  | { type: "connected"; at: number }
  | { type: "disconnected" }
  | { type: "toggle-mute" }
  | { type: "toggle-camera" }
  /** Локальный финал: мы положили трубку или что-то сломалось до ответа сервера. */
  | { type: "local-ended"; status: ChatCallStatus; error?: string | null }
  | { type: "failed"; error: string }
  | { type: "reset" };

export function reduceCall(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case "outgoing-started":
      return { ...IDLE_STATE, phase: "outgoing", call: action.call };

    case "restore": {
      const role = action.call.caller.id === action.selfId ? "caller" : "callee";
      if (action.call.status === "ringing")
        return {
          ...IDLE_STATE,
          phase: role === "caller" ? "outgoing" : "incoming",
          call: action.call,
        };
      if (action.call.status === "accepted")
        // Разговор шёл, вкладку перезагрузили: медиа надо поднимать заново,
        // и это состояние «соединяемся», а не «идёт».
        return { ...IDLE_STATE, phase: "connecting", call: action.call };
      return state;
    }

    case "stream":
      return reduceStream(state, action.event, action.selfId);

    case "accepting":
      return state.phase === "incoming"
        ? { ...state, phase: "connecting" }
        : state;

    case "connected":
      return state.phase === "connecting" || state.phase === "active"
        ? {
            ...state,
            phase: "active",
            reconnecting: false,
            connectedAt: state.connectedAt ?? action.at,
          }
        : state;

    case "disconnected":
      return state.phase === "active" ? { ...state, reconnecting: true } : state;

    case "toggle-mute":
      return { ...state, muted: !state.muted };

    case "toggle-camera":
      return { ...state, cameraOff: !state.cameraOff };

    case "local-ended":
      if (state.phase === "idle" || state.phase === "ended") return state;
      return {
        ...state,
        phase: "ended",
        endedStatus: action.status,
        reconnecting: false,
        error: action.error ?? null,
      };

    case "failed":
      if (state.phase === "idle") return { ...state, error: action.error };
      return {
        ...state,
        phase: "ended",
        endedStatus: "failed",
        reconnecting: false,
        error: action.error,
      };

    case "reset":
      return IDLE_STATE;
  }
}

function reduceStream(
  state: CallState,
  event: ChatCallStreamEvent,
  selfId: string,
): CallState {
  if (event.type === "call.signal") return state; // сигналинг — дело хука

  const sameCall = state.call?.id === event.call.id;

  switch (event.type) {
    case "call.ringing":
      // Входящий показываем, только когда свободны. Второй звонок во время
      // первого сервер и так отвергнет как «занято»; здесь это защита от
      // гонки, когда события пришли раньше ответа на наш POST.
      if (state.phase !== "idle" && state.phase !== "ended") {
        // Наш собственный исходящий, пришедший событием раньше ответа POST.
        return sameCall ? { ...state, call: event.call } : state;
      }
      if (event.call.callee.id === selfId)
        return { ...IDLE_STATE, phase: "incoming", call: event.call };
      if (event.call.caller.id === selfId)
        return { ...IDLE_STATE, phase: "outgoing", call: event.call };
      return state;

    case "call.accepted":
      if (!sameCall) return state;
      return state.phase === "outgoing" || state.phase === "incoming"
        ? { ...state, phase: "connecting", call: event.call }
        : { ...state, call: event.call };

    case "call.ended":
      if (!sameCall) return state;
      if (state.phase === "idle" || state.phase === "ended")
        return { ...state, call: event.call, endedStatus: event.call.status };
      return {
        ...state,
        phase: "ended",
        call: event.call,
        endedStatus: event.call.status,
        reconnecting: false,
      };
  }
}

/** Наша роль в текущем звонке. */
export function roleIn(state: CallState, selfId: string): "caller" | "callee" | null {
  if (!state.call) return null;
  if (state.call.caller.id === selfId) return "caller";
  if (state.call.callee.id === selfId) return "callee";
  return null;
}

/** Собеседник — тот из двух, кто не мы. */
export function companionOf(call: ChatCallDto, selfId: string) {
  return call.caller.id === selfId ? call.callee : call.caller;
}

/** Подпись финала на экране «звонок завершён». */
export function endedLabel(
  status: ChatCallStatus | null,
  role: "caller" | "callee" | null,
): string {
  switch (status) {
    case "ended":
      return "Звонок завершён";
    case "failed":
      return "Связь оборвалась";
    case "missed":
      return role === "caller" ? "Не ответили" : "Пропущенный звонок";
    case "declined":
      return role === "caller" ? "Собеседник отклонил звонок" : "Звонок отклонён";
    case "cancelled":
      return role === "caller" ? "Звонок отменён" : "Звонивший отменил вызов";
    default:
      return "Звонок завершён";
  }
}
