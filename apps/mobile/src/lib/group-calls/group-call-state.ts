import type { ChatGroupCallDto, ChatGroupCallStreamEvent } from '@vedamatch/shared';

/**
 * Состояние экрана группового звонка — чистый редьюсер, как
 * `call-machine.ts` у звонка один на один. Ни WebRTC, ни сети: только «что
 * показывать и что позволено».
 *
 * Отличия от звонка один на один — оттуда же, откуда и всё остальное в
 * групповом звонке:
 * - нет фаз `outgoing`/`incoming`: комната либо идёт, либо нет. «Входящий» —
 *   это плашка в беседе, а не дозвон, и живёт она отдельно от этого
 *   состояния (`group-call-banner.tsx`);
 * - состав меняется по ходу, и каждое изменение приходит событием;
 * - соединений несколько, поэтому «соединяемся» и «разговор» — не одна
 *   общая фаза, а состояние КАЖДОГО собеседника (`peerStates`). Человек в
 *   комнате уже участвует, даже если с одним из троих связь ещё не встала.
 */

export type GroupCallPhase =
  /** Мы не в звонке. */
  | 'idle'
  /** Жмём «войти», сервер ещё не ответил. */
  | 'joining'
  /** Мы в комнате. */
  | 'active'
  /** Вышли или комнату закрыли — показываем итог. */
  | 'ended';

/** Состояние ОДНОГО соединения mesh'а. */
export type PeerConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface GroupCallState {
  phase: GroupCallPhase;
  call: ChatGroupCallDto | null;
  /** userId → как у нас с ним со связью. */
  peerStates: Record<string, PeerConnectionState>;
  /** Кто сейчас говорит (решает `speaking-state.ts` по уровню звука). */
  speaking: string[];
  /** Наш микрофон. Отдельно от `call`: кнопка отвечает сразу, сервер — потом. */
  muted: boolean;
  /** Когда мы вошли (ms) — для таймера на экране. */
  joinedAt: number | null;
  error: string | null;
}

export const IDLE_GROUP_CALL_STATE: GroupCallState = {
  phase: 'idle',
  call: null,
  peerStates: {},
  speaking: [],
  muted: false,
  joinedAt: null,
  error: null,
};

export type GroupCallAction =
  | { type: 'joining' }
  /** Сервер подтвердил вход (ответ `POST /join` или `/heartbeat`). */
  | { type: 'joined'; call: ChatGroupCallDto; at: number }
  /** Событие из общего потока. */
  | { type: 'stream'; event: ChatGroupCallStreamEvent; selfId: string }
  /** Восстановление после перезапуска приложения. */
  | { type: 'restore'; call: ChatGroupCallDto; at: number }
  | { type: 'peer-state'; userId: string; state: PeerConnectionState }
  | { type: 'speaking'; userIds: string[] }
  | { type: 'toggle-mute' }
  | { type: 'muted'; muted: boolean }
  /** Мы вышли сами. */
  | { type: 'left' }
  | { type: 'failed'; error: string }
  | { type: 'reset' };

export function reduceGroupCall(
  state: GroupCallState,
  action: GroupCallAction,
): GroupCallState {
  switch (action.type) {
    case 'joining':
      return state.phase === 'active'
        ? state
        : { ...IDLE_GROUP_CALL_STATE, phase: 'joining' };

    case 'joined':
    case 'restore':
      return {
        ...state,
        phase: 'active',
        call: action.call,
        joinedAt: state.joinedAt ?? action.at,
        error: null,
        // Соединения поднимаются заново — старые состояния не наследуются.
        peerStates: action.type === 'restore' ? {} : state.peerStates,
      };

    case 'stream':
      return reduceStream(state, action.event, action.selfId);

    case 'peer-state': {
      // Состояние соединения с тем, кого в комнате уже нет, не храним:
      // иначе список «соединяемся…» никогда не очистился бы.
      if (state.phase !== 'active') return state;
      return {
        ...state,
        peerStates: { ...state.peerStates, [action.userId]: action.state },
      };
    }

    case 'speaking': {
      if (sameIds(state.speaking, action.userIds)) return state;
      return { ...state, speaking: action.userIds };
    }

    case 'toggle-mute':
      return { ...state, muted: !state.muted };

    case 'muted':
      return { ...state, muted: action.muted };

    case 'left':
      return state.phase === 'idle'
        ? state
        : { ...state, phase: 'ended', peerStates: {}, speaking: [] };

    case 'failed':
      return { ...state, phase: 'ended', error: action.error, peerStates: {}, speaking: [] };

    case 'reset':
      return IDLE_GROUP_CALL_STATE;
  }
}

function reduceStream(
  state: GroupCallState,
  event: ChatGroupCallStreamEvent,
  selfId: string,
): GroupCallState {
  // Сигналинг — дело провайдера, состояние экрана он не меняет.
  if (event.type === 'group-call.signal') return state;
  // Чужая комната (другая беседа) — не наша забота, пока мы в своей.
  if (state.call && state.call.id !== event.call.id) return state;

  if (event.type === 'group-call.ended')
    return state.phase === 'idle'
      ? state
      : { ...state, phase: 'ended', call: event.call, peerStates: {}, speaking: [] };

  if (state.phase !== 'active') return state;

  const stillIn = event.call.participants.some((p) => p.user.id === selfId);
  if (!stillIn)
    // Нас убрали из комнаты (уборщик мёртвых участников, выход с другого
    // устройства). Это финал, а не пустой список собеседников.
    return { ...state, phase: 'ended', call: event.call, peerStates: {}, speaking: [] };

  const present = new Set(event.call.participants.map((p) => p.user.id));
  return {
    ...state,
    call: event.call,
    peerStates: pick(state.peerStates, present),
    speaking: state.speaking.filter((id) => present.has(id)),
  };
}

function pick(
  states: Record<string, PeerConnectionState>,
  keep: ReadonlySet<string>,
): Record<string, PeerConnectionState> {
  const next: Record<string, PeerConnectionState> = {};
  for (const [userId, value] of Object.entries(states))
    if (keep.has(userId)) next[userId] = value;
  return next;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Подпись состояния соединения с конкретным человеком. Молчит, когда всё
 * хорошо: «соединено» под каждым именем — шум, который перестают читать.
 */
export function peerStateLabel(state: PeerConnectionState | undefined): string | null {
  switch (state) {
    case 'connecting':
      return 'Соединяемся…';
    case 'reconnecting':
      return 'Связь пропала…';
    case 'failed':
      return 'Нет связи';
    default:
      return null;
  }
}

/** Можно ли вообще войти в этот звонок: свободное место есть. */
export function canJoin(call: ChatGroupCallDto | null): boolean {
  if (!call || call.status !== 'live') return false;
  return call.participants.length < call.maxParticipants;
}

/**
 * Почему кнопка «Присоединиться» не работает. `null` — работает.
 * Формулировка живёт на клиенте: сервер сообщает факт, тексты собирает тот,
 * кто показывает.
 */
export function joinBlockedReason(call: ChatGroupCallDto | null): string | null {
  if (!call || call.status !== 'live') return 'Звонок уже закончился';
  if (call.participants.length >= call.maxParticipants)
    return `В звонке уже ${call.maxParticipants} человека`;
  return null;
}
