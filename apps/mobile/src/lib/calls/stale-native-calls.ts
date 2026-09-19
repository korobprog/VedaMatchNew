import type { CallConflictState, NativeConnectionInfo } from '../../../modules/vedamatch-calls';

/**
 * Правила «нативный звонок застрял» (прод-баг 2026-09-19, Samsung A51):
 * self-managed `Connection` звонил в Telecom шесть минут после того, как
 * сервер закрыл звонок, и всё это время любой исходящий и входящий
 * отклонялся как «Устройство сейчас занято другим звонком». Чистые
 * функции — решение отдельно от нативного вызова, как `call-busy-decision.ts`.
 *
 * Kotlin держит тот же порог (`StaleCallPolicy.kt`) для своего таймера;
 * совпадение обоих с сервером проверяет `call-ring-timeout.spec.ts`.
 */

/** Серверный таймер дозвона — `RING_TIMEOUT_MS` в
 *  `apps/api/src/modules/chat/calls/call-state.ts`. */
export const SERVER_RING_TIMEOUT_MS = 45_000;

/** Запас сверх серверного таймера — как у серверного `BUSY_TTL_RINGING_MS`. */
export const STALE_GRACE_MS = 15_000;

/** Не отвеченный дольше этого звонок сервер уже точно закрыл. */
export const STALE_RING_AFTER_MS = SERVER_RING_TIMEOUT_MS + STALE_GRACE_MS;

const UNANSWERED: ReadonlySet<NativeConnectionInfo['state']> = new Set(['ringing', 'dialing']);

/** Звонит/набирает дольше порога. Идущий разговор по возрасту не протухает. */
export function isStaleConnection(connection: NativeConnectionInfo): boolean {
  return UNANSWERED.has(connection.state) && connection.ageMs >= STALE_RING_AFTER_MS;
}

/** Есть ли свой звонок, который на самом деле занимает устройство. */
export function hasLiveOwnCall(state: CallConflictState): boolean {
  if (!state.ownCalls) return state.hasOwnCall;
  return state.ownCalls.some((connection) => connection.state !== 'disconnected' && !isStaleConnection(connection));
}

export interface ConnectionsToEndInput {
  connections: readonly NativeConnectionInfo[];
  /** Звонок, который сервер считает незавершённым (`GET /chat/calls/active`). */
  serverActiveCallId: string | null;
  /** Звонок, который прямо сейчас ведёт сам провайдер (мог начаться, пока
   *  шёл запрос к серверу). */
  localCallId: string | null;
  /** Сколько длился запрос к серверу: соединение моложе этого создано уже
   *  после того, как сервер собрал ответ, — ответ о нём ничего не говорит. */
  requestElapsedMs: number;
}

/**
 * Какие соединения погасить после успешной сверки с сервером. Сервер знает
 * ровно один незавершённый звонок человека; всё остальное, что старше
 * запроса, — осколок звонка, чей `call.ended` потерялся или разминулся с
 * созданием соединения. Застрявшие гасятся независимо от возраста запроса.
 */
export function selectConnectionsToEnd(input: ConnectionsToEndInput): string[] {
  const keep = new Set([input.serverActiveCallId, input.localCallId].filter((id): id is string => Boolean(id)));
  return input.connections
    .filter((connection) => !keep.has(connection.callId))
    .filter((connection) => isStaleConnection(connection) || connection.ageMs >= input.requestElapsedMs)
    .map((connection) => connection.callId);
}
