import type {
  BillingMode,
  PricingPlan,
  SubscriptionState,
  SubscriptionStatus,
} from '@vedamatch/shared';

export const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Единственный тариф платформы. Цены дублируются на лендинге через /billing/plan. */
export const VEDAMATCH_PLAN: Omit<PricingPlan, 'mode'> = {
  id: 'vedamatch-basic',
  name: 'VedaMatch',
  priceRub: 108,
  priceUsdt: 2,
  period: 'month',
  trialDays: TRIAL_DAYS,
  features: [
    'Все 7 сервисов платформы в одном аккаунте',
    'Знакомства В Благости: анкеты, рекомендации, чаты',
    'Джйотиш: ведическая карта рождения и совместимость',
    'Vedabase и Библиотека ссылок: чтение офлайн и без ограничений',
    '«Мотивация», «Контакты» и «Рынок» — практика, община и объявления',
    'Проверка фото и подтверждение статуса',
    'Поддержка через тикеты в кабинете',
  ],
};

/** Условный «конец света» для беты — доступ не истекает, пока режим не переключат на business. */
const BETA_ACCESS_UNTIL = new Date('2099-01-01T00:00:00.000Z');

export interface SubscriptionSource {
  createdAt: Date;
  trialEndsAt: Date | null;
  subscriptionPaidUntil: Date | null;
  subscriptionNote: string | null;
}

/**
 * Конец пробного месяца. У аккаунтов, созданных до появления подписки, поле
 * пустое — считаем от даты регистрации, чтобы не выдавать триал повторно.
 */
export function trialEndsAt(user: SubscriptionSource): Date {
  return (
    user.trialEndsAt ?? new Date(user.createdAt.getTime() + TRIAL_DAYS * DAY_MS)
  );
}

export function toSubscriptionState(
  user: SubscriptionSource,
  now: Date = new Date(),
  billingMode: BillingMode = 'business',
): SubscriptionState {
  if (billingMode === 'beta') {
    return {
      status: 'active',
      trialEndsAt: trialEndsAt(user).toISOString(),
      paidUntil: null,
      accessUntil: BETA_ACCESS_UNTIL.toISOString(),
      daysLeft: Math.ceil(
        (BETA_ACCESS_UNTIL.getTime() - now.getTime()) / DAY_MS,
      ),
      note: user.subscriptionNote,
    };
  }

  const trialEnd = trialEndsAt(user);
  const paidUntil = user.subscriptionPaidUntil;
  const paidActive = paidUntil !== null && paidUntil.getTime() > now.getTime();
  const trialActive = trialEnd.getTime() > now.getTime();

  const status: SubscriptionStatus = paidActive
    ? 'active'
    : trialActive
      ? 'trial'
      : 'expired';
  const accessUntil = paidActive ? paidUntil : trialActive ? trialEnd : null;

  return {
    status,
    trialEndsAt: trialEnd.toISOString(),
    paidUntil: paidUntil?.toISOString() ?? null,
    accessUntil: accessUntil?.toISOString() ?? null,
    daysLeft: accessUntil
      ? Math.max(0, Math.ceil((accessUntil.getTime() - now.getTime()) / DAY_MS))
      : 0,
    note: user.subscriptionNote,
  };
}

/**
 * Продление на N месяцев: от текущего конца платного периода, если он ещё не
 * прошёл, иначе от сегодняшнего дня — иначе оплата «сгорала» бы задним числом.
 */
export function extendPaidUntil(
  current: Date | null,
  months: number,
  now: Date = new Date(),
): Date {
  const base =
    current && current.getTime() > now.getTime()
      ? new Date(current)
      : new Date(now);
  const extended = new Date(base);
  extended.setMonth(extended.getMonth() + months);
  return extended;
}
