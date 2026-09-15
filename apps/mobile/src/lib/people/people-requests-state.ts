import type { ContactsRequestDto, ContactsRequestStatus } from '@vedamatch/shared';

/**
 * Правила видимости для запросов контакта, перенесённые с сайта
 * (`chat-people-api.ts`, `people-requests-view.tsx`).
 */

/** Ниже этого остатка стоит напомнить о суточном лимите. */
const REMAINING_WARNING_THRESHOLD = 3;

/** Показывать остаток лимита, когда он меньше порога — не сыпать напоминаниями по умолчанию. */
export function showRemainingToday(remainingToday: number): boolean {
  return remainingToday < REMAINING_WARNING_THRESHOLD;
}

/** «Принять»/«Отклонить» — только у входящего запроса в статусе `pending`. */
export function canRespond(request: Pick<ContactsRequestDto, 'direction' | 'status'>): boolean {
  return request.direction === 'incoming' && request.status === 'pending';
}

/** «Отозвать» — только у своего же ещё не рассмотренного запроса. */
export function canCancel(request: Pick<ContactsRequestDto, 'direction' | 'status'>): boolean {
  return request.direction === 'outgoing' && request.status === 'pending';
}

/** «Написать» — когда запрос уже принят, независимо от того, кто его отправил. */
export function canWrite(request: Pick<ContactsRequestDto, 'status'>): boolean {
  return request.status === 'accepted';
}

/** Какое действие идёт по конкретному запросу: крутилка только на нажатой кнопке. */
export type RequestAction = 'accept' | 'decline' | 'cancel' | 'write';

/** Что стало с запросом контакта — словами, а не значением энума. */
export const CONTACTS_REQUEST_STATUS_LABELS: Record<ContactsRequestStatus, string> = {
  pending: 'Ждёт ответа',
  accepted: 'Контакты открыты',
  declined: 'Отказано',
  cancelled: 'Отозван',
};
