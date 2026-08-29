"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";

/**
 * Показывать ли материалы вложенных рубрик.
 *
 * По умолчанию — да, иначе вложенность работала бы как исчезновение: убрали
 * рубрику внутрь другой, и лента родителя опустела. Но иногда нужен ровно
 * этот уровень, и переключатель это даёт.
 */
export function DescendantsToggle({
  locale,
  enabled,
}: {
  locale: LibraryLocale;
  enabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function set(next: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.delete("withDescendants");
    else params.set("withDescendants", "false");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div
      role="group"
      aria-label={t(locale, "nav.withDescendants")}
      className="mb-4 inline-flex rounded-xl border border-glass-brd p-1 text-sm"
    >
      <button
        type="button"
        onClick={() => set(true)}
        aria-pressed={enabled}
        className={`rounded-lg px-3 py-1.5 ${
          enabled ? "bg-bg-2 text-text-0" : "text-text-2 hover:text-text-0"
        }`}
      >
        {t(locale, "nav.withDescendants")}
      </button>
      <button
        type="button"
        onClick={() => set(false)}
        aria-pressed={!enabled}
        className={`rounded-lg px-3 py-1.5 ${
          enabled ? "text-text-2 hover:text-text-0" : "bg-bg-2 text-text-0"
        }`}
      >
        {t(locale, "nav.onlyHere")}
      </button>
    </div>
  );
}
