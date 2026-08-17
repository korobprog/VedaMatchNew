"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { ServiceIcon } from "@/components/icons/service-icons";
import { greetFirst, type AdvisorCard } from "@/lib/advisor/advisor-cards";
import {
  readDismissals,
  serverDismissals,
  subscribeToDismissals,
  visibleCards,
  writeDismissal,
} from "@/lib/advisor/advisor-dismissals";

/** Цвет полоски слева — единственное, чем виды отличаются визуально. */
const TONE_ACCENT: Record<AdvisorCard["tone"], string> = {
  todo: "before:bg-magenta",
  gap: "before:bg-amber-400",
  discover: "before:bg-cyan",
};

/**
 * Полоса советника под шапкой главной.
 *
 * Карточки приходят готовыми с сервера — считает их `buildAdvisorCards`.
 * Здесь остаётся ровно одно клиентское дело: убрать скрытые.
 *
 * Скрытия читаются через `useSyncExternalStore`, а не эффектом. Эффект дал
 * бы либо `setState` в теле (правило react-hooks/set-state-in-effect в этом
 * репозитории включено как ошибка), либо мигание: сервер отрисовал три
 * карточки, клиент убрал одну. У `useSyncExternalStore` для этого есть
 * отдельный серверный снимок — React знает, что значения разойдутся, и не
 * считает это ошибкой гидратации.
 */
export function AdvisorStrip({
  cards,
  userId,
  displayName,
}: {
  cards: AdvisorCard[];
  userId: string;
  displayName: string;
}) {
  const getSnapshot = useCallback(() => readDismissals(userId), [userId]);
  const dismissals = useSyncExternalStore(
    subscribeToDismissals,
    getSnapshot,
    serverDismissals,
  );

  // Приветствие ставится ПОСЛЕ отсева, а не на сервере: спрятав верхнюю
  // карточку, человек иначе остался бы вообще без обращения по имени.
  const shown = useMemo(
    () => greetFirst(visibleCards(cards, dismissals, new Date()), displayName),
    [cards, dismissals, displayName],
  );

  if (!shown.length) return null;

  return (
    <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((card) => (
        <li
          key={card.id}
          className={`glass relative overflow-hidden rounded-2xl border border-glass-brd p-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] ${TONE_ACCENT[card.tone]}`}
        >
          <div className="flex items-start gap-3">
            {card.service && (
              <ServiceIcon
                slug={card.service}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
            )}
            <p className="flex-1 text-sm leading-snug text-text-1">
              {card.text}
            </p>
            <button
              type="button"
              onClick={() => writeDismissal(userId, card.id)}
              aria-label="Скрыть на неделю"
              title="Скрыть на неделю"
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-text-2 transition hover:bg-glass hover:text-text-0"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
          <Link
            href={card.href}
            className="mt-2 inline-block text-sm font-medium text-text-0 underline underline-offset-2"
          >
            {card.actionLabel}
          </Link>
        </li>
      ))}
    </ul>
  );
}
