/**
 * Темп подсказок новичку на главной.
 *
 * Сразу после регистрации портал говорил всё сразу: три карточки советника,
 * приглашение друга, баннер установки и просьба разрешить уведомления — в
 * первую же секунду, на одном экране. Человек читает это не как помощь, а как
 * список претензий, и уходит.
 *
 * Ничего из этого не отменяется — всё показывается, но по одному и по мере
 * взросления аккаунта. Возраст берётся из `UserProfile.createdAt`: он не
 * зависит от устройства и браузера, поэтому темп не сбивается ни вторым
 * входом с телефона, ни чисткой localStorage.
 *
 * Чистая функция и на сервере, и на клиенте: главная считает это при
 * рендере, а `now` передаётся снаружи ради тестов.
 */

import { ADVISOR_LIMIT } from "@/lib/advisor/advisor-cards";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Возраст аккаунта в целых сутках. Неизвестная или битая дата — «взрослый»:
 * лучше показать всё, чем молча спрятать подсказки у всех, у кого поле не
 * пришло.
 */
export function accountAgeDays(
  createdAt: string | null | undefined,
  now: Date,
): number {
  if (!createdAt) return Number.POSITIVE_INFINITY;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - created) / DAY_MS));
}

/**
 * Сколько карточек советника показать: в первый день одну, дальше по одной
 * в сутки до обычного предела. Порядок карточек задаёт сам советник — вверху
 * всегда важнейшая, поэтому «одна» означает «самая важная», а не случайная.
 */
export function advisorLimitFor(
  createdAt: string | null | undefined,
  now: Date,
): number {
  return Math.min(ADVISOR_LIMIT, 1 + accountAgeDays(createdAt, now));
}

/**
 * Предложение позвать друга. Не в первые сутки: звать людей на портал,
 * которого сам ещё не видел, человеку нечего.
 */
export function showsInviteTeaser(
  createdAt: string | null | undefined,
  now: Date,
): boolean {
  return accountAgeDays(createdAt, now) >= 1;
}

/**
 * Просьба разрешить уведомления и баннер установки — самые навязчивые из
 * всех: одна открывает системное окно, второй занимает низ экрана. Их черёд
 * последний, когда человек уже вернулся на портал не в первый раз.
 */
export function showsInstallPrompts(
  createdAt: string | null | undefined,
  now: Date,
): boolean {
  return accountAgeDays(createdAt, now) >= 2;
}
