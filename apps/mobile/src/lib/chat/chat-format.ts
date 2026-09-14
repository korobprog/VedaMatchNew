import type { ChatAttachmentDto, ChatConversationSummary, ChatMessageDto } from '@vedamatch/shared';

/**
 * Подписи в списке бесед и в переписке, перенесённые с сайта
 * (`apps/web/src/components/chat/chat-time.ts` и `previewOf` в
 * `chat-list-view.tsx`). Даты собираются вручную: русская локаль Intl на
 * Android есть не во всякой прошивке.
 */

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_LONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayDiff(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Время в списке: часы сегодня, «вчера», день недели на этой неделе, дата. */
export function formatChatStamp(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = dayDiff(date, now);
  if (diff <= 0) return formatTime(date);
  if (diff === 1) return 'вчера';
  if (diff < 7) return WEEKDAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** Разделитель в переписке: «Сегодня», «Вчера» или дата, год только чужой. */
export function formatChatDivider(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = dayDiff(date, now);
  if (diff <= 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const base = `${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** Нужен ли разделитель дня перед сообщением. */
export function isNewDay(previous: ChatMessageDto | undefined, current: ChatMessageDto): boolean {
  if (!previous) return true;
  return startOfDay(new Date(previous.createdAt)) !== startOfDay(new Date(current.createdAt));
}

const ATTACHMENT_LABELS: Record<ChatAttachmentDto['kind'], string> = {
  image: 'Фото',
  file: 'Файл',
  voice: 'Голосовое сообщение',
  story: 'История',
  notice: 'Объявление',
  listing: 'Товар',
  contact: 'Контакт',
  assistant: 'Ответ ассистента',
  work: 'Задача',
  vacancy: 'Вакансия',
  call: 'Звонок',
};

export function attachmentLabel(kind: ChatAttachmentDto['kind']): string {
  return ATTACHMENT_LABELS[kind] ?? 'Вложение';
}

/** Превью последнего сообщения в строке списка. */
export function previewOf(conversation: ChatConversationSummary): string {
  const message = conversation.lastMessage;
  if (!message) return 'Пока ни одного сообщения';
  if (message.deletedAt) return 'Сообщение удалено';
  const text = message.body.trim() || (message.attachments[0] ? attachmentLabel(message.attachments[0].kind) : '');
  if (conversation.kind === 'direct') return text;
  return `${message.author.name}: ${text}`;
}

/** Первая буква имени для заглушки аватара. */
export function initialOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

/** Счётчик непрочитанного: больше 99 не показываем цифрами. */
export function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}
