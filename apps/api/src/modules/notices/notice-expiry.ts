import { NOTICE_RENEW_WINDOW_DAYS, type NoticeKind } from '@vedamatch/shared';

/**
 * Сроки жизни объявлений. Чистые функции без Prisma: доска, где просьбы
 * годовой давности висят наравне со свежими, мертва, и правила протухания
 * должны проверяться тестами напрямую.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сколько живёт объявление каждого вида, в днях. */
export const DEFAULT_TTL_DAYS: Record<NoticeKind, number> = {
  // Отдать вещь и найти помощь — вопрос недель, а не месяцев.
  offer: 30,
  request: 30,
  // У события свой срок: оно живёт до конца, см. resolveExpiresAt.
  event: 30,
  // Информация меняется реже всего.
  info: 60,
};

export interface ExpiryInput {
  kind: NoticeKind;
  /** Начало события, если оно есть. */
  startsAt?: Date | null;
  endsAt?: Date | null;
}

/**
 * Когда объявление протухнет.
 *
 * У события срок привязан к дате, а не к сроку публикации: афиша программы,
 * которая прошла вчера, бесполезна, а объявление о фестивале через полгода
 * не должно исчезнуть за месяц до него.
 */
export function resolveExpiresAt(input: ExpiryInput, now: Date): Date {
  if (input.kind === 'event') {
    const finish = input.endsAt ?? input.startsAt;
    // Событие без даты — обычное объявление: пусть живёт по общему правилу.
    if (finish) return new Date(finish.getTime() + DAY_MS);
  }
  return new Date(now.getTime() + DEFAULT_TTL_DAYS[input.kind] * DAY_MS);
}

/**
 * Можно ли продлить прямо сейчас. Раньше окна продлевать нечего — это
 * превратилось бы в кнопку «поднять в топ», нажимаемую каждый день.
 */
export function canRenew(
  expiresAt: Date,
  now: Date,
  kind: NoticeKind,
  startsAt?: Date | null,
): boolean {
  // Прошедшее событие не продлевают: у него новая дата, а не новый срок.
  if (kind === 'event' && startsAt) return false;
  const msLeft = expiresAt.getTime() - now.getTime();
  return msLeft <= NOTICE_RENEW_WINDOW_DAYS * DAY_MS;
}

/**
 * Новый срок при продлении. Отсчитывается от «сейчас», а не от старого срока:
 * иначе продление просроченного объявления не давало бы ему ни дня жизни.
 */
export function renewedExpiresAt(kind: NoticeKind, now: Date): Date {
  return new Date(now.getTime() + DEFAULT_TTL_DAYS[kind] * DAY_MS);
}

/** Объявление считается живым — по данным, а не по статусу воркера. */
export function isLive(status: string, expiresAt: Date, now: Date): boolean {
  return status === 'published' && expiresAt.getTime() > now.getTime();
}
