import type { BillingMode } from '@vedamatch/shared';

/**
 * Что позволяет тариф. Публичные моменты — платная возможность, и это
 * единственное место, где записано, кому она открыта.
 *
 * Пока портал в бете, она открыта всем: бета бесплатна, и запирать за
 * оплатой то, что пока никто не оплачивает, — значит показывать людям
 * замок вместо возможности. Когда портал переключат в рабочий режим,
 * возможность останется у оплаченных аккаунтов, а у остальных публичные
 * моменты **тихо перестанут быть публичными**, не исчезнув: момент,
 * пропавший у автора из-за окончания подписки, читается как потеря данных.
 */
export type MomentsPlan = 'beta' | 'pro' | 'free';

export function momentsPlanOf(
  billingMode: BillingMode,
  paidUntil: Date | null,
  now: Date = new Date(),
): MomentsPlan {
  if (billingMode === 'beta') return 'beta';
  return paidUntil && paidUntil.getTime() > now.getTime() ? 'pro' : 'free';
}

/** Можно ли сейчас показывать моменты всему порталу. */
export function everyoneAllowed(plan: MomentsPlan): boolean {
  return plan !== 'free';
}

/**
 * Включена ли публичность у человека.
 *
 * `stored === null` означает «как в тарифе»: в бете выключено (закрытое
 * умолчание — то же решение, что у видимости бесед), у оплаченного аккаунта
 * включено, потому что это ровно та возможность, за которую он платит.
 *
 * Явно выставленное значение сильнее умолчания в обе стороны: человек,
 * выключивший публичность руками, не должен получить её обратно вместе с
 * оплатой, а включивший — потерять её при переходе портала в рабочий режим.
 */
export function everyoneEnabled(
  stored: boolean | null,
  plan: MomentsPlan,
): boolean {
  if (!everyoneAllowed(plan)) return false;
  if (stored !== null) return stored;
  return plan === 'pro';
}

/** Почему возможность недоступна. `null` — доступна. */
export function planNote(plan: MomentsPlan): string | null {
  return plan === 'free'
    ? 'Моменты видны всему порталу на платном тарифе. Сейчас их видят только ваши собеседники.'
    : null;
}
