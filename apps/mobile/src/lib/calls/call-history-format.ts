import type { ChatCallDto, ChatCallKind, ChatCallStatus } from '@vedamatch/shared';

/**
 * Форматирование истории звонков (вкладка «Звонки») — перенос логики
 * `apps/web/src/components/chat/calls/calls-history-view.tsx` в чистые
 * функции с тестами, без разметки.
 */

export const CALL_STATUS_LABEL: Record<ChatCallStatus, string> = {
  ringing: 'звонок шёл',
  accepted: 'разговор',
  declined: 'отклонён',
  missed: 'пропущен',
  cancelled: 'отменён',
  ended: 'завершён',
  failed: 'не состоялся',
};

/** Пропущенный — красным и с пометкой на вкладке «Звонки»: отклонённый тоже. */
export function isMissedCall(status: ChatCallStatus): boolean {
  return status === 'missed' || status === 'declined';
}

/** Звонок исходящий или входящий, глядя от лица `userId`. */
export function callDirection(call: Pick<ChatCallDto, 'caller'>, userId: string): 'outgoing' | 'incoming' {
  return call.caller.id === userId ? 'outgoing' : 'incoming';
}

/** Собеседник в строке истории — не мы. */
export function callCompanion(call: Pick<ChatCallDto, 'caller' | 'callee'>, userId: string) {
  return call.caller.id === userId ? call.callee : call.caller;
}

/** Длительность разговора — `null`, если ответа не было. */
export function callDuration(call: Pick<ChatCallDto, 'answeredAt' | 'endedAt'>): string | null {
  if (!call.answeredAt || !call.endedAt) return null;
  const seconds = Math.max(
    0,
    Math.round((new Date(call.endedAt).getTime() - new Date(call.answeredAt).getTime()) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} мин ${String(seconds % 60).padStart(2, '0')} с` : `${seconds} с`;
}

/** Подпись строки: «исходящий · видео · разговор · 12 мин · 09.09.2026». */
export function callSummaryLine(call: ChatCallDto, userId: string, now = new Date()): string {
  const direction = callDirection(call, userId) === 'outgoing' ? 'исходящий' : 'входящий';
  const kindLabel = kindSuffix(call.kind);
  const status = CALL_STATUS_LABEL[call.status] ?? call.status;
  const talk = callDuration(call);
  const date = formatCallDate(call.createdAt, now);
  return [direction + kindLabel, status, talk, date].filter(Boolean).join(' · ');
}

function kindSuffix(kind: ChatCallKind): string {
  return kind === 'video' ? ' · видео' : '';
}

/** Сегодня — время, иначе дата: строка того же диалога недавних звонков читается быстрее. */
export function formatCallDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ru-RU');
}
