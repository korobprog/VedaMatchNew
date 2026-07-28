import type {
  SupportTicketCategory,
  SupportTicketStatus,
  SubscriptionStatus,
} from "@vedamatch/shared";

export const ticketStatusLabels: Record<SupportTicketStatus, string> = {
  open: "Новое",
  in_progress: "В работе",
  waiting_user: "Ждём ответа",
  resolved: "Решено",
  closed: "Закрыто",
};

/** Цвет статуса: открытые обращения должны выделяться в списке. */
export const ticketStatusClasses: Record<SupportTicketStatus, string> = {
  open: "border-magenta/40 bg-magenta/10 text-magenta",
  in_progress: "border-cyan/40 bg-cyan/10 text-cyan",
  waiting_user: "border-gold/40 bg-gold/10 text-gold",
  resolved: "border-glass-brd bg-glass text-text-1",
  closed: "border-glass-brd bg-glass text-text-2",
};

export const ticketCategoryLabels: Record<SupportTicketCategory, string> = {
  billing: "Оплата и подписка",
  account: "Аккаунт и вход",
  technical: "Техническая проблема",
  moderation: "Жалоба или модерация",
  partnership: "Сотрудничество",
  other: "Другое",
};

export const ticketCategories: SupportTicketCategory[] = [
  "billing",
  "account",
  "technical",
  "moderation",
  "partnership",
  "other",
];

export const ticketStatuses: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
];

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  trial: "Пробный период",
  active: "Активна",
  expired: "Истекла",
};

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** «2 ч 15 мин» — сколько тикет ждёт первого ответа. */
export function formatWaiting(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч ${minutes % 60} мин`;
  return `${Math.floor(hours / 24)} дн ${hours % 24} ч`;
}
