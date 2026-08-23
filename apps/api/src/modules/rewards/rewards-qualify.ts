/**
 * Целевое действие приглашённого — единственное место, где решается, за что
 * вообще платятся баллы.
 *
 * В бете оплаты нет, поэтому платим не за регистрацию (её накрутить проще
 * всего), а за подтверждённую активность: человек заполнил профиль, что-то
 * сделал в одном из сервисов и прожил на портале несколько дней. После беты
 * условие меняется на «оплатил абонемент» правкой этой функции — модуль,
 * очередь, антифрод и админка остаются как есть.
 */

/** Портальный профиль приглашённого, read-only из `User`. */
export interface ReferralProfileSnapshot {
  name: string | null;
  avatarUrl: string | null;
  /** Город из `User.homeLocation`; null — не заполнен. */
  city: string | null;
}

export interface ReferralQualificationInput {
  registeredAt: Date;
  profile: ReferralProfileSnapshot;
  /**
   * Когда пришло первое осмысленное действие из любого сервиса. Берётся из
   * события шины, а не из чужих таблиц.
   */
  activityAt: Date | null;
}

export interface ReferralQualificationOptions {
  /** Сколько дней должно пройти с регистрации. Из настроек модуля. */
  qualifyMinDays: number;
  /** Задержка начисления после выполнения условия, в часах. */
  accrualDelayHours: number;
}

export type ReferralQualificationReason =
  'profile_incomplete' | 'no_activity' | 'too_early';

export interface ReferralQualification {
  qualified: boolean;
  /** Почему пока нет; `null` — условие выполнено. */
  reason: ReferralQualificationReason | null;
  /** Момент, с которого условие считается выполненным. */
  qualifiedAt: Date | null;
  /**
   * Не раньше этого момента начисление уходит в леджер. Всегда задан, даже
   * когда условие ещё не выполнено: воркеру нужно знать, когда возвращаться,
   * а очередь без даты пришлось бы перебирать целиком.
   */
  eligibleAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Заполнен ли профиль настолько, чтобы человек выглядел живым. */
export function isProfileComplete(profile: ReferralProfileSnapshot): boolean {
  return Boolean(
    profile.name?.trim() && profile.avatarUrl?.trim() && profile.city?.trim(),
  );
}

/**
 * Выполнено ли целевое действие на момент `now`.
 *
 * Порядок проверок — от дешёвого и понятного человеку к временнóму: в
 * админке видна причина, и «профиль не заполнен» полезнее, чем «ещё рано»,
 * когда верно и то, и другое.
 */
export function qualifyReferral(
  input: ReferralQualificationInput,
  options: ReferralQualificationOptions,
  now: Date,
): ReferralQualification {
  const matureAt = new Date(
    input.registeredAt.getTime() + Math.max(0, options.qualifyMinDays) * DAY_MS,
  );
  const delayMs = Math.max(0, options.accrualDelayHours) * HOUR_MS;

  if (!isProfileComplete(input.profile)) {
    return {
      qualified: false,
      reason: 'profile_incomplete',
      qualifiedAt: null,
      // Профиль дозаполняют когда угодно; ждать раньше «взросления» нечего.
      eligibleAt: new Date(Math.max(matureAt.getTime(), now.getTime())),
    };
  }
  if (!input.activityAt) {
    return {
      qualified: false,
      reason: 'no_activity',
      qualifiedAt: null,
      eligibleAt: new Date(Math.max(matureAt.getTime(), now.getTime())),
    };
  }

  // Условие выполнено в поздний из двух моментов: активность могла случиться
  // и в первый день, но три дня всё равно должны пройти.
  const qualifiedAt = new Date(
    Math.max(input.activityAt.getTime(), matureAt.getTime()),
  );
  const eligibleAt = new Date(qualifiedAt.getTime() + delayMs);

  if (qualifiedAt.getTime() > now.getTime()) {
    return {
      qualified: false,
      reason: 'too_early',
      qualifiedAt: null,
      eligibleAt,
    };
  }
  return { qualified: true, reason: null, qualifiedAt, eligibleAt };
}
