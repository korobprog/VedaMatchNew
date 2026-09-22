import type { Gender, SpiritualStage } from '@vedamatch/shared';
import { needsOnboarding } from './onboarding-steps';

/**
 * Решение «показывать ли онбординг сейчас» (VED-333) — отдельно от экрана,
 * потому что от него зависит, увидит ли человек вообще хоть что-нибудь после
 * входа, и ошибка здесь стоит дороже любой опечатки в тексте вопроса.
 */

/**
 * Чем онбординг закрыт на эту сессию приложения:
 * - `'done'` — ответы сохранены на сервере;
 * - `'deferred'` — человек нажал «Позже»;
 * - `null` — не закрывали.
 */
export type OnboardingDismissal = 'done' | 'deferred' | null;

export interface OnboardingInput {
  status: 'loading' | 'guest' | 'signed';
  /** Профиль из сессии; `null` — ещё не загрузился либо не загрузился вовсе. */
  user: { spiritualStage: SpiritualStage | null; gender: Gender | null } | null;
  dismissal: OnboardingDismissal;
}

/**
 * Показывать ли экран вопросов вместо вкладок.
 *
 * Гостю и пока сессия восстанавливается — нет: гость видит экран входа, а
 * мигание онбординга перед чатами читается так же плохо, как мигание входа.
 *
 * Профиль `null` при живой сессии — не «человек без самоопределения», а «не
 * знаем»: `session.tsx` пускает в приложение с сохранёнными токенами, когда
 * `GET /users/me` не прошёл по сети. Спросить тогда значит завести человека
 * в анкету по факту отсутствия связи, а сохранить ответы всё равно не выйдет.
 * Вопрос задастся, когда профиль догрузится.
 */
export function shouldShowOnboarding({ status, user, dismissal }: OnboardingInput): boolean {
  if (status !== 'signed') return false;
  if (dismissal !== null) return false;
  if (!user) return false;
  return needsOnboarding(user);
}

/**
 * Что делать с отметкой «закрыт» при смене состояния сессии. Выход из
 * аккаунта её снимает: следующий вошедший — другой человек, и отложенное
 * предыдущим его не касается.
 */
export function nextDismissal(
  current: OnboardingDismissal,
  status: OnboardingInput['status'],
): OnboardingDismissal {
  return status === 'signed' ? current : null;
}
