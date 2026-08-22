import type { Prisma } from '@prisma/client';

/**
 * Карточка справочника заводится вместе с самим пользователем и сразу видна
 * остальным: справочник — это список участников портала, а не отдельная
 * подписка, на которую нужно записаться. Всё содержимое карточки (имя, город,
 * аватар, духовный этап) берётся join-ом из `User`, поэтому пустая по своим
 * полям запись уже показывает человека осмысленно.
 *
 * Способы связи это НЕ раскрывает: телефон и мессенджеры отдаются только по
 * действующему `ContactsDisclosure`, см. `PeopleService.disclosedContacts`.
 * Уйти из выдачи можно в любой момент — `visibility: 'hidden'` в редакторе.
 *
 * Значения продублированы в бэкфилле
 * `prisma/migrations/20260814090000_contacts_profile_for_every_user` и в
 * `AuthService.ensureContactsProfile`; менять их нужно во всех трёх местах.
 */
export const NEW_CONTACTS_PROFILE: Omit<
  Prisma.ContactsProfileUncheckedCreateInput,
  'userId'
> = {
  status: 'active',
  visibility: 'everyone',
};
