"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Сколько висит подсказка — «надпись на 2 секунды потом исчезает». */
export const NEED_CHART_NOTICE_MS = 2000;

/**
 * «Сначала составьте свою натальную карту» (VED-659): горячая кнопка
 * «Транзиты» у того, у кого карты ещё нет, приводит сюда с `?need=chart`.
 * Надпись держится две секунды и исчезает; параметр уходит из адреса, чтобы
 * обновление страницы не показывало её снова.
 */
export function NeedChartNotice() {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      router.replace(pathname, { scroll: false });
    }, NEED_CHART_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [router, pathname]);

  return (
    <p
      role="status"
      className={`fixed inset-x-4 top-20 z-50 mx-auto max-w-sm rounded-2xl border border-magenta/40 bg-bg-1 px-4 py-3 text-center text-sm font-semibold text-text-0 shadow-lg transition-opacity ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      Сначала составьте свою натальную карту
    </p>
  );
}
