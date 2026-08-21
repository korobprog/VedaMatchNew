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

/**
 * Возможности тарифа. Список жил в двух копиях — VEDAMATCH_PLAN в apps/api и
 * PLAN в apps/web — и успел разойтись: где-то «Знакомства В Благости», где-то
 * «Знакомства в Благости». Каноничная формулировка одна, здесь; обе стороны
 * берут её отсюда.
 */
export const PLAN_FEATURES: string[] = [
  'Все 8 сервисов платформы в одном аккаунте',
  '«Знакомства в Благости»: анкеты, рекомендации, чаты',
  '«Астрология»: ведическая карта рождения и совместимость',
  '«Vedabase» и «Образование»: чтение офлайн и без ограничений',
  '«Мотивация», «Контакты» и «Рынок» — практика, община и объявления',
  'Проверка фото и подтверждение статуса',
  'Поддержка через тикеты в кабинете',
];

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

// ===== Пожертвования на развитие (бета) =====

export type DonationRequisiteKind = 'sbp' | 'card' | 'crypto' | 'link' | 'other';
export const DONATION_REQUISITE_KINDS: readonly DonationRequisiteKind[] = [
  'sbp',
  'card',
  'crypto',
  'link',
  'other',
];

export interface DonationRequisite {
  kind: DonationRequisiteKind;
  /** Подпись строки: «Перевод по СБП», «USDT TRC-20». */
  label: string;
  /** Сам реквизит: номер, адрес или URL — копируется в один тап. */
  value: string;
}

/** Публичный ответ: только когда включено и есть хотя бы один реквизит. */
export interface DonationSettingsDto {
  enabled: boolean;
  text: string;
  requisites: DonationRequisite[];
}

export interface AdminUpdateDonationRequest {
  enabled?: boolean;
  text?: string | null;
  requisites?: DonationRequisite[];
}

export interface AdminUpdateSubscriptionRequest {
  /** ISO-дата оплаченного доступа; null — сбросить платный период. */
  paidUntil?: string | null;
  /** Продлить платный доступ на N месяцев от максимума (сегодня, текущий конец). */
  addMonths?: number;
  note?: string | null;
}
