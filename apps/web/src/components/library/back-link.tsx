"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";
import { MAX_BACK_HOPS, shouldSkipOnBack } from "./back-history";

/**
 * Сколько ждём очередного шага назад. `popstate` приходит за миллисекунды;
 * не пришёл — позади истории больше нет, и мы застряли на записи, которую
 * хотели миновать.
 */
const HOP_TIMEOUT_MS = 1000;

type Router = ReturnType<typeof useRouter>;

/**
 * Шаг назад по истории, минуя формы добавления и ту же страницу (VED-397).
 *
 * Чужую запись истории заранее не прочитать, поэтому идём по одной и
 * смотрим, куда пришли: слушатель `popstate` живёт на `window` и переживает
 * размонтирование кнопки, пока переходы идут. Каждый лишний шаг Next.js
 * отрисовывает из кэша, форма мелькает на доли секунды.
 */
function backSkippingForms(router: Router, fallbackHref: string) {
  const origin = window.location.pathname;
  let hops = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    window.removeEventListener("popstate", onPopState);
    if (timer) clearTimeout(timer);
  };
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      stop();
      // Истории позади не осталось, а стоим на форме или там же, откуда
      // ушли, — уводим на запасной адрес, как при заходе по прямой ссылке.
      if (hops > 0 && shouldSkipOnBack(window.location.pathname, origin)) {
        router.replace(fallbackHref);
      }
    }, HOP_TIMEOUT_MS);
  };
  function onPopState() {
    hops += 1;
    if (
      hops < MAX_BACK_HOPS &&
      shouldSkipOnBack(window.location.pathname, origin)
    ) {
      arm();
      window.history.back();
      return;
    }
    stop();
  }

  window.addEventListener("popstate", onPopState);
  arm();
  router.back();
}

/**
 * Кнопка «назад» на внутренних страницах библиотеки.
 *
 * Возвращаемся по истории, чтобы сохранились фильтры и позиция в ленте, но
 * при заходе по прямой ссылке истории нет — тогда уходим на fallback.
 * Формы добавления «Назад» проходит насквозь — см. `backSkippingForms`.
 */
export function BackLink({
  locale,
  fallbackHref,
  skipHistory = false,
}: {
  locale: LibraryLocale;
  fallbackHref: string;
  /**
   * Сразу на `fallbackHref`, мимо истории. Нужно странице только что
   * опубликованного материала (VED-91): позади в истории — форма добавления,
   * и «назад» возвращал человека в редакцию вместо портала.
   */
  skipHistory?: boolean;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (skipHistory) {
          router.replace(fallbackHref);
          return;
        }
        if (window.history.length > 1) {
          backSkippingForms(router, fallbackHref);
          return;
        }
        router.push(fallbackHref);
      }}
      // Цель касания 44 пикселя при прежнем месте на экране: отрицательный
      // верхний отступ съедает прибавку высоты.
      className="-mt-3 mb-1 inline-flex min-h-11 items-center gap-1.5 pr-2 text-sm text-text-2 hover:text-text-0"
    >
      <ArrowLeft aria-hidden className="h-4 w-4" />
      {t(locale, "nav.back")}
    </button>
  );
}
