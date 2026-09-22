import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/auth/session';
import {
  nextDismissal,
  shouldShowOnboarding,
  type OnboardingDismissal,
} from './onboarding-decision';

/**
 * Развилка «новичок или уже освоившийся» — ровно там же, где приложение
 * разводит гостя и вошедшего: в корневом стеке (`root-shell-stack.tsx`).
 * Провайдер держит одно состояние — закрыт ли онбординг на эту сессию, —
 * а само решение считает чистая `shouldShowOnboarding`.
 *
 * Отложенное живёт в памяти, а не в хранилище, намеренно. Сайт отложить
 * вообще не даёт: `needsWelcome` уводит в мастер с пяти страниц подряд, и
 * выйти оттуда, не ответив, нельзя. Приложение мягче на одну ступень —
 * человек часто открывает его из пуша, ради одного сообщения, и стена
 * вопросов вместо переписки хуже, чем незаполненная анкета. Но «Позже»
 * здесь значит «до следующего запуска», а не «никогда»: записав отказ в
 * хранилище, мы получили бы ровно ту дыру, из-за которой заведена VED-333, —
 * человека, который навсегда остался без самоопределения.
 */
export interface OnboardingGate {
  /** Показывать ли экран вопросов вместо вкладок. */
  visible: boolean;
  /** «Позже» — до следующего запуска приложения. */
  defer(): void;
  /** Ответы сохранены на сервере. */
  complete(): void;
}

const GateContext = createContext<OnboardingGate | null>(null);

export function OnboardingGateProvider({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const [dismissal, setDismissal] = useState<OnboardingDismissal>(null);

  // Выход из аккаунта снимает отметку: следующий вошедший — другой человек.
  useEffect(() => {
    setDismissal((current) => nextDismissal(current, status));
  }, [status]);

  const defer = useCallback(() => setDismissal('deferred'), []);
  const complete = useCallback(() => setDismissal('done'), []);

  const value = useMemo<OnboardingGate>(
    () => ({ visible: shouldShowOnboarding({ status, user, dismissal }), defer, complete }),
    [complete, defer, dismissal, status, user],
  );

  return <GateContext.Provider value={value}>{children}</GateContext.Provider>;
}

export function useOnboardingGate(): OnboardingGate {
  const gate = useContext(GateContext);
  if (!gate) throw new Error('useOnboardingGate вне OnboardingGateProvider');
  return gate;
}
