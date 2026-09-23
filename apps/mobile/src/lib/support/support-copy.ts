import type {
  SupportTicketCategory,
  SupportTicketListItem,
  SupportTicketMessageDto,
  SupportTicketStatus,
} from '@vedamatch/shared';

/**
 * Слова поддержки в приложении (VED-336) — те же, что на сайте
 * (`apps/web/src/lib/support-labels.ts`): человек, открывший обращение и там
 * и тут, не должен видеть два разных названия одного статуса.
 */

export const TICKET_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Новое',
  in_progress: 'В работе',
  waiting_user: 'Ждём ответа',
  resolved: 'Решено',
  closed: 'Закрыто',
};

export const TICKET_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  // На сайте — «Оплата и подписка». Здесь слово про оплату не годится:
  // магазинная сборка не должна звать оплатить мимо витрины, и сторож
  // `config/store-build.spec.ts` ловит это слово в любом тексте. Вопрос тот же
  // — о доступе к платному, поэтому и категория та же, `billing`.
  billing: 'Подписка и доступ',
  account: 'Аккаунт и вход',
  technical: 'Техническая проблема',
  moderation: 'Жалоба или модерация',
  partnership: 'Сотрудничество',
  other: 'Другое',
};

/** Порядок категорий в форме — как на сайте. */
export const TICKET_CATEGORY_ORDER: readonly SupportTicketCategory[] = [
  'technical',
  'account',
  'billing',
  'moderation',
  'partnership',
  'other',
];

/**
 * Статус, который ждёт человека: поддержка ответила и молчит, пока он не
 * напишет. Такие обращения выделяются в списке словом, не только цветом.
 */
export function awaitsUser(status: SupportTicketStatus): boolean {
  return status === 'waiting_user';
}

/** Закрытое обращение: писать в него нельзя, сервер вернёт его в работу только для незакрытых. */
export function acceptsReplies(status: SupportTicketStatus): boolean {
  return status !== 'closed';
}

const two = (value: number) => String(value).padStart(2, '0');

/**
 * «21.09, 14:05», а в прошлом году — «21.09.2025, 14:05». Без `Intl`:
 * на Hermes локаль `ru-RU` есть не во всех сборках, а дата в обращении
 * должна читаться одинаково на любом телефоне.
 */
export function formatTicketTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${two(date.getDate())}.${two(date.getMonth() + 1)}`;
  const year = date.getFullYear() === now.getFullYear() ? '' : `.${date.getFullYear()}`;
  return `${day}${year}, ${two(date.getHours())}:${two(date.getMinutes())}`;
}

export interface TicketRowCopy {
  title: string;
  status: string;
  details: string;
  /** Поддержка ответила — показать отдельной строкой. */
  awaitsUser: boolean;
  accessibilityLabel: string;
}

/** Строка списка «Мои обращения». */
export function describeTicketRow(item: SupportTicketListItem, now = new Date()): TicketRowCopy {
  const status = TICKET_STATUS_LABELS[item.status] ?? item.status;
  const answer = item.firstResponseAt ? 'поддержка ответила' : 'ждёт первого ответа';
  const details = `${TICKET_CATEGORY_LABELS[item.category] ?? 'Другое'} · ${formatTicketTime(item.lastMessageAt, now)} · ${answer}`;
  const waiting = awaitsUser(item.status);
  return {
    title: `№${item.number} · ${item.subject}`,
    status,
    details,
    awaitsUser: waiting,
    accessibilityLabel: [
      `Обращение ${item.number}: ${item.subject}`,
      status,
      waiting ? 'Поддержка ждёт вашего ответа' : null,
      details,
    ]
      .filter(Boolean)
      .join('. '),
  };
}

/** Подпись автора сообщения в переписке. */
export function messageAuthor(message: Pick<SupportTicketMessageDto, 'authorType' | 'authorName'>): string {
  if (message.authorType === 'admin') return message.authorName ?? 'Поддержка VedaMatch';
  return 'Вы';
}

/** Пустой список обращений. */
export const SUPPORT_EMPTY = {
  title: 'Обращений пока нет',
  body: 'Если что-то не работает или непонятно — напишите нам. Ответ придёт сюда и уведомлением.',
};
