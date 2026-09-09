import type { ChatCallEndReason, ChatCallStatus } from '@vedamatch/shared';

/**
 * Переходы состояний звонка. Отдельным чистым модулем: правил немного, но
 * ошибка в них — это либо звонок, который нельзя завершить, либо чужой
 * человек, принимающий не свой вызов. Сервис только применяет решение.
 */

export type CallRole = 'caller' | 'callee';

export type CallAction =
  | 'accept'
  | 'decline'
  | 'end'
  /** Истёк дозвон — действие сервера, не человека. */
  | 'timeout';

export interface CallTransition {
  status: ChatCallStatus;
  endReason: ChatCallEndReason | null;
}

/** Финальные статусы: из них выхода нет. */
export const FINAL_CALL_STATUSES: ReadonlySet<ChatCallStatus> = new Set([
  'declined',
  'missed',
  'cancelled',
  'ended',
  'failed',
]);

export function isFinal(status: ChatCallStatus): boolean {
  return FINAL_CALL_STATUSES.has(status);
}

/**
 * Куда переходит звонок. `null` — переход запрещён: не та роль, не то
 * состояние или звонок уже завершён.
 *
 * `end` из `ringing` у звонившего — отмена (`cancelled`), у вызываемого —
 * то же, что отклонить. Из `accepted` любая сторона завершает; причина
 * `network` даёт `failed`, чтобы в статистике обрыв отличался от «положил
 * трубку».
 */
export function transition(
  status: ChatCallStatus,
  action: CallAction,
  by: CallRole,
  reason: ChatCallEndReason = 'hangup',
): CallTransition | null {
  if (isFinal(status)) return null;

  switch (action) {
    case 'accept':
      return status === 'ringing' && by === 'callee'
        ? { status: 'accepted', endReason: null }
        : null;
    case 'decline':
      return status === 'ringing' && by === 'callee'
        ? { status: 'declined', endReason: 'hangup' }
        : null;
    case 'timeout':
      return status === 'ringing'
        ? { status: 'missed', endReason: 'timeout' }
        : null;
    case 'end':
      if (status === 'ringing')
        return by === 'caller'
          ? { status: 'cancelled', endReason: reason }
          : { status: 'declined', endReason: reason };
      return {
        status: reason === 'network' ? 'failed' : 'ended',
        endReason: reason,
      };
  }
}

/** Роль человека в звонке; `null` — он в нём не участвует. */
export function roleOf(
  call: { callerId: string; calleeId: string },
  userId: string,
): CallRole | null {
  if (call.callerId === userId) return 'caller';
  if (call.calleeId === userId) return 'callee';
  return null;
}

/** Сколько дозваниваемся, прежде чем записать пропущенный. */
export const RING_TIMEOUT_MS = 45_000;

/**
 * Сколько держим отметку «занят». Дозвон — чуть дольше таймера; принятый
 * звонок — с запасом на длинный разговор, отметка снимается при завершении.
 */
export const BUSY_TTL_RINGING_MS = RING_TIMEOUT_MS + 15_000;
export const BUSY_TTL_ACTIVE_MS = 6 * 60 * 60_000;
