// Типы поддержки: тикеты гостей с лендинга и обращения из кабинета.

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_user'
  | 'resolved'
  | 'closed';

export type SupportTicketCategory =
  | 'billing'
  | 'account'
  | 'technical'
  | 'moderation'
  | 'partnership'
  | 'other';

export type SupportTicketAuthor = 'user' | 'guest' | 'admin';

export interface CreateSupportTicketRequest {
  subject: string;
  message: string;
  category?: SupportTicketCategory;
  /** Гостю обязателен хотя бы один контакт: email или telegram. */
  contactEmail?: string | null;
  contactTelegram?: string | null;
  contactName?: string | null;
}

export interface CreateSupportTicketResponse {
  number: number;
  /** Ссылка вида /support/track/<token> — единственный доступ гостя к тикету. */
  trackToken: string;
  status: SupportTicketStatus;
  createdAt: string;
}

export interface SupportTicketMessageDto {
  id: string;
  authorType: SupportTicketAuthor;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface SupportTicketDto {
  id: string;
  number: number;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  firstResponseAt: string | null;
  closedAt: string | null;
  contactEmail: string | null;
  contactTelegram: string | null;
  messages: SupportTicketMessageDto[];
}

export interface SupportTicketListItem {
  id: string;
  number: number;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  createdAt: string;
  lastMessageAt: string;
  firstResponseAt: string | null;
  messageCount: number;
}

export interface SupportTicketListResponse {
  items: SupportTicketListItem[];
  openCount: number;
}

export interface AddSupportMessageRequest {
  body: string;
  /** Только для админа: заметка, скрытая от пользователя. */
  isInternal?: boolean;
}

export interface AdminSupportTicketListItem extends SupportTicketListItem {
  contactEmail: string | null;
  contactTelegram: string | null;
  contactName: string | null;
  requester: { id: string; name: string; email: string } | null;
  assignedTo: { id: string; name: string } | null;
  /** Сколько ждёт первого ответа, в минутах. null — ответ уже дан. */
  waitingMinutes: number | null;
}

export interface AdminSupportTicketListResponse {
  items: AdminSupportTicketListItem[];
  openCount: number;
}

export interface AdminSupportTicketDto extends SupportTicketDto {
  contactName: string | null;
  adminNote: string | null;
  requester: {
    id: string;
    name: string;
    email: string;
    subscription: SubscriptionState;
  } | null;
  assignedTo: { id: string; name: string } | null;
  /** Внутренние заметки видны только в админском DTO. */
  internalMessages: SupportTicketMessageDto[];
}

export interface AdminUpdateSupportTicketRequest {
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  adminNote?: string | null;
  /** true — взять тикет на себя, false — снять исполнителя. */
  assignToMe?: boolean;
}

export type SubscriptionStatus = 'trial' | 'active' | 'expired';

/** beta — доступ бесплатный для всех, business — обычная логика тарифа с оплатой. */
export type BillingMode = 'beta' | 'business';

export interface SubscriptionState {
  status: SubscriptionStatus;
  /** Конец пробного месяца. */
  trialEndsAt: string | null;
  /** Оплаченный доступ до этой даты. */
  paidUntil: string | null;
  /** Дата, до которой сервис доступен по любой из причин. */
  accessUntil: string | null;
  daysLeft: number;
  note: string | null;
}

export interface PricingPlan {
  id: string;
  name: string;
  priceRub: number;
  priceUsdt: number;
  period: 'month';
  trialDays: number;
  features: string[];
  /** Текущий режим биллинга платформы. */
  mode: BillingMode;
}

export interface AdminBillingModeResponse {
  mode: BillingMode;
}

export interface AdminUpdateBillingModeRequest {
  mode: BillingMode;
}

export interface AdminUpdateSubscriptionRequest {
  /** ISO-дата оплаченного доступа; null — сбросить платный период. */
  paidUntil?: string | null;
  /** Продлить платный доступ на N месяцев от максимума (сегодня, текущий конец). */
  addMonths?: number;
  note?: string | null;
}
