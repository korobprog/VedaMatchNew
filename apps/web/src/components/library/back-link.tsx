"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";

/**
 * Кнопка «назад» на внутренних страницах библиотеки.
 *
 * Возвращаемся по истории, чтобы сохранились фильтры и позиция в ленте, но
 * при заходе по прямой ссылке истории нет — тогда уходим на fallback.
 */
export function BackLink({
  locale,
  fallbackHref,
}: {
  locale: LibraryLocale;
  fallbackHref: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-text-0"
    >
      <ArrowLeft aria-hidden className="h-4 w-4" />
      {t(locale, "nav.back")}
    </button>
  );
}
