import type { VacancyEvent, VacancyEventName } from '@vedamatch/shared';

/**
 * События «Вакансий» для шины портала.
 *
 * Имена литералами, а не импортом значения из `@vedamatch/shared`: пакет не
 * собирается, и вывезенное оттуда значение заставило бы Node грузить сырой
 * TypeScript. Тип сверяет литералы с контрактом — тот же приём, что в
 * work-events.ts у «Работы».
 *
 * Подписчики (Чат открывает диалог, Уведомления пишут текст, Работа кладёт
 * отклик в агенду) появятся в VED-27. Payload уже самодостаточен: в событии
 * едут заголовок и вид предложения, имя соискателя и его сообщение.
 */
export const VACANCY_EVENTS = {
  responseCreated: 'vacancies.response.created',
  responseStatusChanged: 'vacancies.response.status-changed',
  offerClosed: 'vacancies.offer.closed',
} as const satisfies Record<string, VacancyEventName>;

type EventOf<TName extends VacancyEventName> = Extract<
  VacancyEvent,
  { name: TName }
>;

export type VacancyResponseCreatedEvent = EventOf<'vacancies.response.created'>;
export type VacancyResponseStatusChangedEvent =
  EventOf<'vacancies.response.status-changed'>;
export type VacancyOfferClosedEvent = EventOf<'vacancies.offer.closed'>;
