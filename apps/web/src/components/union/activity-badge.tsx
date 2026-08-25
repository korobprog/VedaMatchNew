"use client";

import { useEffect, useState } from "react";
import type { UnionActivityLevel } from "@vedamatch/shared";
import { lastSeenLabel } from "@/lib/union/last-seen";

/**
 * Активность профиля: подпись последнего визита с точностью, которую отдал
 * сервер, и точка-индикатор рядом.
 *
 * Вариант `overlay` рисуется поверх фото без подложки — строка с тенью, а не
 * пилюля: пилюля на всю ширину карточки спорила с именем под ней.
 */
export function ActivityBadge({
  activity,
  lastSeenAt = null,
  variant = "inline",
}: {
  activity: UnionActivityLevel | null;
  lastSeenAt?: string | null;
  variant?: "inline" | "overlay";
}) {
  // Подпись зависит от «сейчас», поэтому считается только после гидратации:
  // время на сервере и в браузере разное, и React ругался бы на расхождение.
  const [label, setLabel] = useState(() => lastSeenLabel(activity, null));

  useEffect(() => {
    // Тот же случай, ради которого эффект и нужен: значение зависит от
    // «сейчас», а синхронно получить его к первому рендеру нельзя — на
    // сервере время другое, и разметка разошлась бы при гидратации. Тот же
    // приём у возрастного фильтра, см. recommendation-filters.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(lastSeenLabel(activity, lastSeenAt));
  }, [activity, lastSeenAt]);

  if (!label) return null;

  const fresh = activity === "online";

  return (
    <span
      data-testid="activity-badge"
      // Тот же кегль и вес, что у пилюль интересов и фактов: строка над
      // именем — такая же справка об анкете, а не заголовок.
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${
        variant === "overlay"
          ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
          : "rounded-full border border-glass-brd px-2 py-0.5 font-medium text-text-1"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          fresh ? "bg-cyan shadow-[0_0_8px_var(--vm-glow-cyan)]" : "bg-text-2"
        }`}
      />
      {label}
    </span>
  );
}
