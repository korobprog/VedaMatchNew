import type { ChatCallKind, ChatCallStatus } from '@vedamatch/shared';

/**
 * Запись о звонке в ленте диалога. Одна формулировка на обоих участников:
 * сообщение общее, и «исходящий/входящий» решает клиент по автору строки
 * (автор — звонивший).
 */

export interface CallSummaryInput {
  kind: ChatCallKind;
  status: ChatCallStatus;
  answeredAt?: Date | string | null;
  endedAt?: Date | string | null;
}

export interface CallSummary {
  /** Текст сообщения — то, что видно в списке бесед и в уведомлении. */
  body: string;
  /** Заголовок карточки-вложения. */
  title: string;
  /** Исход или длительность — подпись под заголовком. */
  subtitle: string;
}

const KIND_LABEL: Record<ChatCallKind, string> = {
  audio: 'Аудиозвонок',
  video: 'Видеозвонок',
};

/** «12:05» до часа, «1:02:05» — дольше. Без ведущих нулей в часах. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function callDurationSeconds(input: CallSummaryInput): number | null {
  if (!input.answeredAt || !input.endedAt) return null;
  const a = new Date(input.answeredAt).getTime();
  const b = new Date(input.endedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 1000);
}

export function callSummary(input: CallSummaryInput): CallSummary {
  const title = KIND_LABEL[input.kind];
  switch (input.status) {
    case 'ended': {
      const seconds = callDurationSeconds(input);
      const subtitle = seconds === null ? 'Состоялся' : formatDuration(seconds);
      return { title, subtitle, body: `${title} · ${subtitle}` };
    }
    case 'failed':
      return { title, subtitle: 'Оборвался', body: `${title} оборвался` };
    case 'missed':
      return {
        title,
        subtitle: 'Пропущенный',
        body: `Пропущенный ${title.toLowerCase()}`,
      };
    case 'declined':
      return { title, subtitle: 'Отклонён', body: `${title} отклонён` };
    case 'cancelled':
      return { title, subtitle: 'Отменён', body: `${title} отменён` };
    default:
      return { title, subtitle: 'Идёт', body: title };
  }
}
